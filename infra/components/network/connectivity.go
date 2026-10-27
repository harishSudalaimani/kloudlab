package network

import (
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/ec2"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

// PeerNetwork is the minimal output contract used by the connectivity stack.
type PeerNetwork struct {
	Name                 string
	VPCID                pulumi.StringInput
	CIDRBlock            pulumi.StringInput
	PrivateRouteTableIDs []pulumi.StringInput
}

// ConnectivityArgs defines the four VPCs joined by the initial non-transitive
// peering mesh.
type ConnectivityArgs struct {
	Networks           []PeerNetwork
	ProtectConnections bool
	Tags               map[string]string
}

// Connectivity represents the direct peering mesh between the four VPCs.
type Connectivity struct {
	pulumi.ResourceState

	appIdentityPeeringID              pulumi.IDOutput
	appObservabilityPeeringID         pulumi.IDOutput
	appManagementPeeringID            pulumi.IDOutput
	identityObservabilityPeeringID    pulumi.IDOutput
	identityManagementPeeringID       pulumi.IDOutput
	observabilityManagementPeeringID  pulumi.IDOutput
}

// AppIdentityPeeringID returns the application/identity peering ID.
func (c *Connectivity) AppIdentityPeeringID() pulumi.IDOutput {
	return c.appIdentityPeeringID
}

// AppObservabilityPeeringID returns the application/observability peering ID.
func (c *Connectivity) AppObservabilityPeeringID() pulumi.IDOutput {
	return c.appObservabilityPeeringID
}

// AppManagementPeeringID returns the application/management peering ID.
func (c *Connectivity) AppManagementPeeringID() pulumi.IDOutput {
	return c.appManagementPeeringID
}

// IdentityObservabilityPeeringID returns the identity/observability peering ID.
func (c *Connectivity) IdentityObservabilityPeeringID() pulumi.IDOutput {
	return c.identityObservabilityPeeringID
}

// IdentityManagementPeeringID returns the identity/management peering ID.
func (c *Connectivity) IdentityManagementPeeringID() pulumi.IDOutput {
	return c.identityManagementPeeringID
}

// ObservabilityManagementPeeringID returns the observability/management peering ID.
func (c *Connectivity) ObservabilityManagementPeeringID() pulumi.IDOutput {
	return c.observabilityManagementPeeringID
}

// NewConnectivity creates pairwise peering connections and routes in every
// private subnet route table. It expects four VPCs in the same AWS account
// and region; VPC peering does not provide transitive routing.
func NewConnectivity(ctx *pulumi.Context, name string, args *ConnectivityArgs, opts ...pulumi.ResourceOption) (*Connectivity, error) {
	networks, err := validateConnectivityArgs(args)
	if err != nil {
		return nil, err
	}
	component := &Connectivity{}
	if err := ctx.RegisterComponentResource("kloudlab:network:Connectivity", name, component, opts...); err != nil {
		return nil, err
	}

	appIdentity, err := createPeering(ctx, component, name, "app-identity", networks["app"], networks["identity"], args)
	if err != nil {
		return nil, err
	}
	appObservability, err := createPeering(ctx, component, name, "app-observability", networks["app"], networks["observability"], args)
	if err != nil {
		return nil, err
	}
	appManagement, err := createPeering(ctx, component, name, "app-management", networks["app"], networks["management"], args)
	if err != nil {
		return nil, err
	}
	identityObservability, err := createPeering(ctx, component, name, "identity-observability", networks["identity"], networks["observability"], args)
	if err != nil {
		return nil, err
	}
	identityManagement, err := createPeering(ctx, component, name, "identity-management", networks["identity"], networks["management"], args)
	if err != nil {
		return nil, err
	}
	observabilityManagement, err := createPeering(ctx, component, name, "observability-management", networks["observability"], networks["management"], args)
	if err != nil {
		return nil, err
	}

	component.appIdentityPeeringID = appIdentity.ID()
	component.appObservabilityPeeringID = appObservability.ID()
	component.appManagementPeeringID = appManagement.ID()
	component.identityObservabilityPeeringID = identityObservability.ID()
	component.identityManagementPeeringID = identityManagement.ID()
	component.observabilityManagementPeeringID = observabilityManagement.ID()
	component.RegisterOutputs(pulumi.Map{
		"appIdentityPeeringId":             component.appIdentityPeeringID,
		"appObservabilityPeeringId":        component.appObservabilityPeeringID,
		"appManagementPeeringId":           component.appManagementPeeringID,
		"identityObservabilityPeeringId":  component.identityObservabilityPeeringID,
		"identityManagementPeeringId":     component.identityManagementPeeringID,
		"observabilityManagementPeeringId": component.observabilityManagementPeeringID,
	})
	return component, nil
}

func validateConnectivityArgs(args *ConnectivityArgs) (map[string]PeerNetwork, error) {
	if args == nil {
		return nil, fmt.Errorf("connectivity arguments are required")
	}
	if len(args.Networks) != 4 {
		return nil, fmt.Errorf("connectivity requires app, identity, observability, and management VPCs")
	}
	networks := make(map[string]PeerNetwork, len(args.Networks))
	for _, network := range args.Networks {
		if network.Name != "app" && network.Name != "identity" && network.Name != "observability" && network.Name != "management" {
			return nil, fmt.Errorf("unknown VPC name %q", network.Name)
		}
		if _, exists := networks[network.Name]; exists {
			return nil, fmt.Errorf("VPC %q is configured more than once", network.Name)
		}
		if network.VPCID == nil || network.CIDRBlock == nil {
			return nil, fmt.Errorf("VPC %q must export its ID and CIDR block", network.Name)
		}
		if len(network.PrivateRouteTableIDs) < 3 {
			return nil, fmt.Errorf("VPC %q must provide at least three private route tables", network.Name)
		}
		networks[network.Name] = network
	}
	return networks, nil
}

func createPeering(
	ctx *pulumi.Context,
	parent *Connectivity,
	name string,
	pair string,
	requester PeerNetwork,
	accepter PeerNetwork,
	args *ConnectivityArgs,
) (*ec2.VpcPeeringConnection, error) {
	peeringName := name + "-" + pair
	peering, err := ec2.NewVpcPeeringConnection(ctx, peeringName, &ec2.VpcPeeringConnectionArgs{
		VpcId:     requester.VPCID,
		PeerVpcId: accepter.VPCID,
		AutoAccept: pulumi.Bool(true),
		Tags:      makeTags(args.Tags, peeringName),
	}, pulumi.Parent(parent), pulumi.Protect(args.ProtectConnections))
	if err != nil {
		return nil, err
	}
	if err := createPeeringRoutes(ctx, parent, name, pair, requester, accepter, peering, args.ProtectConnections); err != nil {
		return nil, err
	}
	if err := createPeeringRoutes(ctx, parent, name, pair, accepter, requester, peering, args.ProtectConnections); err != nil {
		return nil, err
	}
	return peering, nil
}

func createPeeringRoutes(
	ctx *pulumi.Context,
	parent *Connectivity,
	name string,
	pair string,
	local PeerNetwork,
	remote PeerNetwork,
	peering *ec2.VpcPeeringConnection,
	protect bool,
) error {
	for index, routeTableID := range local.PrivateRouteTableIDs {
		routeName := fmt.Sprintf("%s-%s-%s-to-%s-route-%d", name, pair, local.Name, remote.Name, index+1)
		_, err := ec2.NewRoute(ctx, routeName, &ec2.RouteArgs{
			RouteTableId:            routeTableID,
			DestinationCidrBlock:    remote.CIDRBlock,
			VpcPeeringConnectionId: peering.ID(),
		}, pulumi.Parent(parent), pulumi.Protect(protect))
		if err != nil {
			return err
		}
	}
	return nil
}
