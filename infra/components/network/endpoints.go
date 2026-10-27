package network

import (
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/ec2"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/vpc"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

// createEKSAuthEndpoint gives private worker nodes a private path to the EKS
// Auth API used by EKS Pod Identity.
func createEKSAuthEndpoint(
	ctx *pulumi.Context,
	parent *VPC,
	awsVPC *ec2.Vpc,
	subnets *subnetSet,
	name string,
	args *Args,
) (*ec2.VpcEndpoint, error) {
	securityGroup, err := ec2.NewSecurityGroup(ctx, name+"-eks-auth-endpoint-sg", &ec2.SecurityGroupArgs{
		VpcId:       awsVPC.ID(),
		Description: pulumi.String("Allow private EKS nodes to reach the EKS Auth API"),
		Tags:        makeTags(args.Tags, name+"-eks-auth-endpoint-sg"),
	}, pulumi.Parent(parent))
	if err != nil {
		return nil, err
	}
	if _, err := vpc.NewSecurityGroupIngressRule(ctx, name+"-eks-auth-endpoint-https-ingress", &vpc.SecurityGroupIngressRuleArgs{
		SecurityGroupId: securityGroup.ID(),
		IpProtocol:      pulumi.String("tcp"),
		FromPort:        pulumi.Int(443),
		ToPort:          pulumi.Int(443),
		CidrIpv4:        pulumi.String(args.CIDRBlock),
		Description:     pulumi.String("HTTPS from nodes in this VPC to the EKS Auth API"),
	}, pulumi.Parent(parent), pulumi.DependsOn([]pulumi.Resource{securityGroup})); err != nil {
		return nil, err
	}

	return ec2.NewVpcEndpoint(ctx, name+"-eks-auth-endpoint", &ec2.VpcEndpointArgs{
		VpcId:             awsVPC.ID(),
		ServiceName:       pulumi.StringPtr("com.amazonaws." + args.Region + ".eks-auth"),
		VpcEndpointType:   pulumi.StringPtr("Interface"),
		PrivateDnsEnabled: pulumi.BoolPtr(true),
		SubnetIds:         subnetIDs(subnets.private),
		SecurityGroupIds:  pulumi.StringArray{securityGroup.ID()},
		Tags:              makeTags(args.Tags, name+"-eks-auth-endpoint"),
	}, pulumi.Parent(parent), pulumi.DependsOn([]pulumi.Resource{securityGroup}))
}
