package networkprogram

import (
	"fmt"

	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	pulumiconfig "github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"

	"github.com/harishsudalaimani/kloudlab/infra/components/network"
	"github.com/harishsudalaimani/kloudlab/infra/config"
)

// Run builds one of the app, identity, observability, or management VPC stacks.
func Run(ctx *pulumi.Context, workload string) error {
	stackConfig := pulumiconfig.New(ctx, "kloudlab-network")
	awsConfig := pulumiconfig.New(ctx, "aws")
	environment := stackConfig.Require("environment")
	region := awsConfig.Require("region")
	common := config.Common{
		Project:     "kloudlab",
		Environment: environment,
		Region:      region,
	}
	if err := common.Validate(); err != nil {
		return err
	}

	cidrBlock := stackConfig.Require("cidrBlock")
	if !stackConfig.GetBool("cidrInventoryReviewed") {
		return fmt.Errorf("set cidrInventoryReviewed=true only after checking all connected VPC, VPN, and on-premises CIDRs")
	}
	var availabilityZones []string
	stackConfig.RequireObject("availabilityZones", &availabilityZones)
	var peerCIDRs []string
	if err := stackConfig.GetObject("peerCIDRs", &peerCIDRs); err != nil {
		return err
	}
	var connectedCIDRs []string
	if err := stackConfig.GetObject("connectedCIDRs", &connectedCIDRs); err != nil {
		return err
	}
	otherCIDRs := append(peerCIDRs, connectedCIDRs...)
	allCIDRs := append([]string{cidrBlock}, otherCIDRs...)
	if err := config.ValidateNonOverlappingCIDRs(allCIDRs); err != nil {
		return err
	}

	name, err := config.ResourcePrefix(common.Project, common.Environment, workload)
	if err != nil {
		return err
	}
	tags, err := config.BuildTags(common, "network-"+workload, nil)
	if err != nil {
		return err
	}
	subnetPrefixLength := stackConfig.GetInt("subnetPrefixLength")
	if subnetPrefixLength == 0 {
		subnetPrefixLength = 20
	}
	vpc, err := network.NewVPC(ctx, name, &network.Args{
		Environment:        environment,
		Region:             region,
		CIDRBlock:          cidrBlock,
		OtherCIDRs:         otherCIDRs,
		AvailabilityZones:  availabilityZones,
		SubnetPrefixLength: subnetPrefixLength,
		NATGatewayMode:     network.NATGatewayMode(stackConfig.Require("natGatewayMode")),
		ProtectVPC:         stackConfig.GetBool("protectVpc"),
		Tags:               tags,
	})
	if err != nil {
		return err
	}

	ctx.Export("vpcId", vpc.VPCID())
	ctx.Export("cidrBlock", vpc.CIDRBlock())
	zoneInputs := make(pulumi.StringArray, 0, len(availabilityZones))
	for _, zone := range availabilityZones {
		zoneInputs = append(zoneInputs, pulumi.String(zone))
	}
	ctx.Export("availabilityZones", zoneInputs)
	ctx.Export("publicSubnetIds", vpc.PublicSubnetIDs())
	ctx.Export("privateSubnetIds", vpc.PrivateSubnetIDs())
	ctx.Export("publicRouteTableId", vpc.PublicRouteTableID())
	ctx.Export("privateRouteTableIds", vpc.PrivateRouteTableIDs())
	ctx.Export("s3GatewayEndpointId", vpc.S3GatewayEndpointID())
	return nil
}
