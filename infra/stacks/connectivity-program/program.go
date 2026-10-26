package connectivityprogram

import (
	"fmt"

	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"

	"github.com/harishsudalaimani/kloudlab/infra/components/network"
	"github.com/harishsudalaimani/kloudlab/infra/config"
)

// Run connects the app, identity, and observability network stacks.
func Run(ctx *pulumi.Context) error {
	stackConfig := pulumi.NewConfig(ctx, "kloudlab-connectivity")
	awsConfig := pulumi.NewConfig(ctx, "aws")
	common := config.Common{
		Project:     "kloudlab",
		Environment: stackConfig.Require("environment"),
		Region:      awsConfig.Require("region"),
	}
	if err := common.Validate(); err != nil {
		return err
	}
	tags, err := config.BuildTags(common, "network-connectivity", nil)
	if err != nil {
		return err
	}

	privateRouteTableCount := stackConfig.GetInt("privateRouteTableCount")
	if privateRouteTableCount < 3 {
		return fmt.Errorf("privateRouteTableCount must be at least three")
	}
	networks := make([]network.PeerNetwork, 0, 3)
	for _, name := range []string{"app", "identity", "observability"} {
		referenceName := stackConfig.Require(name + "NetworkStack")
		reference, err := pulumi.NewStackReference(ctx, name+"-network-reference", &pulumi.StackReferenceArgs{
			Name: pulumi.String(referenceName),
		})
		if err != nil {
			return err
		}
		routeTableOutput := reference.GetOutput(pulumi.String("privateRouteTableIds")).AsStringArrayOutput()
		routeTableIDs := make([]pulumi.StringInput, 0, privateRouteTableCount)
		for index := 0; index < privateRouteTableCount; index++ {
			routeTableIDs = append(routeTableIDs, routeTableOutput.Index(pulumi.Int(index)))
		}
		networks = append(networks, network.PeerNetwork{
			Name:                 name,
			VPCID:                reference.GetStringOutput(pulumi.String("vpcId")),
			CIDRBlock:            reference.GetStringOutput(pulumi.String("cidrBlock")),
			PrivateRouteTableIDs: routeTableIDs,
		})
	}

	name, err := config.ResourcePrefix("kloudlab", common.Environment, "connectivity")
	if err != nil {
		return err
	}
	mesh, err := network.NewConnectivity(ctx, name, &network.ConnectivityArgs{
		Networks:           networks,
		ProtectConnections: stackConfig.GetBool("protectConnections"),
		Tags:               tags,
	})
	if err != nil {
		return err
	}
	ctx.Export("appIdentityPeeringId", mesh.AppIdentityPeeringID())
	ctx.Export("appObservabilityPeeringId", mesh.AppObservabilityPeeringID())
	ctx.Export("identityObservabilityPeeringId", mesh.IdentityObservabilityPeeringID())
	return nil
}
