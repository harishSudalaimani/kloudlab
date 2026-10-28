package connectivityprogram

import (
	"fmt"

	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	pulumiconfig "github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"

	"github.com/harishsudalaimani/kloudlab/infra/components/network"
	"github.com/harishsudalaimani/kloudlab/infra/config"
)

// Run connects the configured workload network stacks.
func Run(ctx *pulumi.Context) error {
	stackConfig := pulumiconfig.New(ctx, "kloudlab-connectivity")
	awsConfig := pulumiconfig.New(ctx, "aws")
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
	if privateRouteTableCount < 2 {
		return fmt.Errorf("privateRouteTableCount must be at least two")
	}
	networkNames := []string{"app"}
	includeIdentity := stackConfig.GetBool("includeIdentityNetwork")
	if includeIdentity {
		networkNames = append(networkNames, "identity")
	}
	networkNames = append(networkNames, "observability", "management")
	networks := make([]network.PeerNetwork, 0, len(networkNames))
	for _, name := range networkNames {
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
	ctx.Export("appObservabilityPeeringId", mesh.PeeringID("app-observability"))
	ctx.Export("appManagementPeeringId", mesh.PeeringID("app-management"))
	ctx.Export("observabilityManagementPeeringId", mesh.PeeringID("observability-management"))
	if includeIdentity {
		ctx.Export("appIdentityPeeringId", mesh.PeeringID("app-identity"))
		ctx.Export("identityObservabilityPeeringId", mesh.PeeringID("identity-observability"))
		ctx.Export("identityManagementPeeringId", mesh.PeeringID("identity-management"))
	}
	return nil
}
