package network

import (
	"fmt"
	"net/netip"

	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/ec2"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"

	"github.com/harishsudalaimani/kloudlab/infra/config"
)

// NewVPC creates a DNS-enabled VPC with public and private subnets across the
// configured Availability Zones. NAT egress, routes, and the S3 gateway
// endpoint are created by the dedicated routing helper.
func NewVPC(ctx *pulumi.Context, name string, args *Args, opts ...pulumi.ResourceOption) (*VPC, error) {
	if err := validateArgs(name, args); err != nil {
		return nil, err
	}

	component := &VPC{}
	if err := ctx.RegisterComponentResource("kloudlab:network:Vpc", name, component, opts...); err != nil {
		return nil, err
	}

	vpc, err := ec2.NewVpc(ctx, name+"-vpc", &ec2.VpcArgs{
		CidrBlock:          pulumi.String(args.CIDRBlock),
		EnableDnsSupport:   pulumi.Bool(true),
		EnableDnsHostnames: pulumi.Bool(true),
		InstanceTenancy:    pulumi.String("default"),
		Tags:               makeTags(args.Tags, name+"-vpc"),
	}, pulumi.Parent(component), pulumi.Protect(args.ProtectVPC))
	if err != nil {
		return nil, err
	}

	internetGateway, err := ec2.NewInternetGateway(ctx, name+"-igw", &ec2.InternetGatewayArgs{
		VpcId: vpc.ID(),
		Tags:  makeTags(args.Tags, name+"-igw"),
	}, pulumi.Parent(component))
	if err != nil {
		return nil, err
	}

	subnets, err := createSubnets(ctx, component, vpc, name, args)
	if err != nil {
		return nil, err
	}
	routes, err := createRouting(ctx, component, vpc, internetGateway, subnets, name, args)
	if err != nil {
		return nil, err
	}

	component.vpcID = vpc.ID().ToStringOutput()
	component.cidrBlock = pulumi.String(args.CIDRBlock).ToStringOutput()
	component.publicSubnetIDs = subnetIDs(subnets.public).ToStringArrayOutput()
	component.privateSubnetIDs = subnetIDs(subnets.private).ToStringArrayOutput()
	component.publicRouteTableID = routes.publicRouteTable.ID().ToStringOutput()
	component.privateRouteTableIDs = routeTableIDs(routes.privateRouteTables).ToStringArrayOutput()
	component.s3GatewayEndpointID = routes.s3Endpoint.ID()

	component.RegisterOutputs(pulumi.Map{
		"vpcId":                component.vpcID,
		"cidrBlock":            component.cidrBlock,
		"publicSubnetIds":      component.publicSubnetIDs,
		"privateSubnetIds":     component.privateSubnetIDs,
		"publicRouteTableId":   component.publicRouteTableID,
		"privateRouteTableIds": component.privateRouteTableIDs,
		"s3GatewayEndpointId":  component.s3GatewayEndpointID,
	})

	return component, nil
}

func validateArgs(name string, args *Args) error {
	if name == "" {
		return fmt.Errorf("VPC component name is required")
	}
	if args == nil {
		return fmt.Errorf("VPC component arguments are required")
	}
	if args.Region == "" {
		return fmt.Errorf("AWS region is required")
	}
	if args.Environment == "" {
		return fmt.Errorf("environment is required")
	}

	prefix, err := netip.ParsePrefix(args.CIDRBlock)
	if err != nil || !prefix.Addr().Is4() || prefix.Bits() < 16 || prefix.Bits() > 28 {
		return fmt.Errorf("VPC CIDR %q must be a valid IPv4 prefix from /16 through /28", args.CIDRBlock)
	}

	allCIDRs := append([]string{args.CIDRBlock}, args.OtherCIDRs...)
	if err := config.ValidateNonOverlappingCIDRs(allCIDRs); err != nil {
		return err
	}
	if len(args.AvailabilityZones) < 3 {
		return fmt.Errorf("at least three Availability Zones are required, got %d", len(args.AvailabilityZones))
	}
	seenZones := make(map[string]struct{}, len(args.AvailabilityZones))
	for _, zone := range args.AvailabilityZones {
		if zone == "" {
			return fmt.Errorf("Availability Zone names cannot be empty")
		}
		if len(zone) <= len(args.Region) || zone[:len(args.Region)] != args.Region {
			return fmt.Errorf("Availability Zone %q must belong to region %q", zone, args.Region)
		}
		if _, exists := seenZones[zone]; exists {
			return fmt.Errorf("Availability Zone %q is repeated", zone)
		}
		seenZones[zone] = struct{}{}
	}
	if args.SubnetPrefixLength <= prefix.Bits() || args.SubnetPrefixLength > 28 {
		return fmt.Errorf("subnet prefix /%d must be longer than the VPC prefix and no longer than /28", args.SubnetPrefixLength)
	}
	if args.NATGatewayMode != NATGatewaySingle && args.NATGatewayMode != NATGatewayPerAZ {
		return fmt.Errorf("NAT gateway mode must be %q or %q", NATGatewaySingle, NATGatewayPerAZ)
	}
	if (args.Environment == "prod" || args.Environment == "production") && args.NATGatewayMode != NATGatewayPerAZ {
		return fmt.Errorf("production networks require one NAT gateway per Availability Zone")
	}
	_, err = splitCIDRs(args.CIDRBlock, args.SubnetPrefixLength, len(args.AvailabilityZones)*2)
	return err
}

func makeTags(base map[string]string, name string) pulumi.StringMap {
	tags := make(pulumi.StringMap, len(base)+1)
	for key, value := range base {
		tags[key] = pulumi.String(value)
	}
	tags["Name"] = pulumi.String(name)
	return tags
}

func subnetIDs(subnets []*ec2.Subnet) pulumi.StringArray {
	ids := make(pulumi.StringArray, 0, len(subnets))
	for _, subnet := range subnets {
		ids = append(ids, subnet.ID().ToStringOutput())
	}
	return ids
}

func routeTableIDs(routeTables []*ec2.RouteTable) pulumi.StringArray {
	ids := make(pulumi.StringArray, 0, len(routeTables))
	for _, routeTable := range routeTables {
		ids = append(ids, routeTable.ID().ToStringOutput())
	}
	return ids
}
