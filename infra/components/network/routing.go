package network

import (
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/ec2"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

type routingSet struct {
	publicRouteTable   *ec2.RouteTable
	privateRouteTables []*ec2.RouteTable
	s3Endpoint         *ec2.VpcEndpoint
}

func createRouting(
	ctx *pulumi.Context,
	parent *VPC,
	vpc *ec2.Vpc,
	internetGateway *ec2.InternetGateway,
	subnets *subnetSet,
	name string,
	args *Args,
) (*routingSet, error) {
	result := &routingSet{
		privateRouteTables: make([]*ec2.RouteTable, 0, len(subnets.private)),
	}
	publicRouteTable, err := ec2.NewRouteTable(ctx, name+"-public-rt", &ec2.RouteTableArgs{
		VpcId: vpc.ID(),
		Tags:  makeTags(args.Tags, name+"-public-rt"),
	}, pulumi.Parent(parent))
	if err != nil {
		return nil, err
	}
	result.publicRouteTable = publicRouteTable

	_, err = ec2.NewRoute(ctx, name+"-public-default-route", &ec2.RouteArgs{
		RouteTableId:         publicRouteTable.ID(),
		DestinationCidrBlock: pulumi.String("0.0.0.0/0"),
		GatewayId:            internetGateway.ID(),
	}, pulumi.Parent(parent))
	if err != nil {
		return nil, err
	}

	for index, subnet := range subnets.public {
		_, err = ec2.NewRouteTableAssociation(ctx, fmt.Sprintf("%s-public-rta-%d", name, index+1), &ec2.RouteTableAssociationArgs{
			SubnetId:     subnet.ID(),
			RouteTableId: publicRouteTable.ID(),
		}, pulumi.Parent(parent))
		if err != nil {
			return nil, err
		}
	}

	natGateways := make([]*ec2.NatGateway, 0, len(subnets.public))
	natCount := len(subnets.public)
	if args.NATGatewayMode == NATGatewaySingle {
		natCount = 1
	}
	for index := 0; index < natCount; index++ {
		natName := fmt.Sprintf("%s-nat-%d", name, index+1)
		allocation, err := ec2.NewEip(ctx, natName+"-eip", &ec2.EipArgs{
			Domain: pulumi.String("vpc"),
			Tags:   makeTags(args.Tags, natName+"-eip"),
		}, pulumi.Parent(parent), pulumi.DependsOn([]pulumi.Resource{internetGateway}))
		if err != nil {
			return nil, err
		}
		natGateway, err := ec2.NewNatGateway(ctx, natName, &ec2.NatGatewayArgs{
			AllocationId: allocation.ID(),
			SubnetId:     subnets.public[index].ID(),
			Tags:         makeTags(args.Tags, natName),
		}, pulumi.Parent(parent), pulumi.DependsOn([]pulumi.Resource{internetGateway}))
		if err != nil {
			return nil, err
		}
		natGateways = append(natGateways, natGateway)
	}

	privateRouteTableIDs := make(pulumi.StringArray, 0, len(subnets.private))
	for index, subnet := range subnets.private {
		routeTableName := fmt.Sprintf("%s-private-rt-%d", name, index+1)
		routeTable, err := ec2.NewRouteTable(ctx, routeTableName, &ec2.RouteTableArgs{
			VpcId: vpc.ID(),
			Tags:  makeTags(args.Tags, routeTableName),
		}, pulumi.Parent(parent))
		if err != nil {
			return nil, err
		}
		result.privateRouteTables = append(result.privateRouteTables, routeTable)
		privateRouteTableIDs = append(privateRouteTableIDs, routeTable.ID().ToStringOutput())

		_, err = ec2.NewRouteTableAssociation(ctx, fmt.Sprintf("%s-private-rta-%d", name, index+1), &ec2.RouteTableAssociationArgs{
			SubnetId:     subnet.ID(),
			RouteTableId: routeTable.ID(),
		}, pulumi.Parent(parent))
		if err != nil {
			return nil, err
		}

		natIndex := index
		if args.NATGatewayMode == NATGatewaySingle {
			natIndex = 0
		}
		_, err = ec2.NewRoute(ctx, fmt.Sprintf("%s-private-default-route-%d", name, index+1), &ec2.RouteArgs{
			RouteTableId:         routeTable.ID(),
			DestinationCidrBlock: pulumi.String("0.0.0.0/0"),
			NatGatewayId:         natGateways[natIndex].ID(),
		}, pulumi.Parent(parent))
		if err != nil {
			return nil, err
		}
	}

	result.s3Endpoint, err = ec2.NewVpcEndpoint(ctx, name+"-s3-gateway-endpoint", &ec2.VpcEndpointArgs{
		VpcId:           vpc.ID(),
		ServiceName:     pulumi.String("com.amazonaws." + args.Region + ".s3"),
		VpcEndpointType: pulumi.String("Gateway"),
		RouteTableIds:   privateRouteTableIDs,
		Tags:            makeTags(args.Tags, name+"-s3-gateway-endpoint"),
	}, pulumi.Parent(parent))
	if err != nil {
		return nil, err
	}
	return result, nil
}
