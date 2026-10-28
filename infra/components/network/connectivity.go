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

// ConnectivityArgs defines the VPCs joined by a direct, non-transitive
// peering mesh for private service and cluster-management traffic.
type ConnectivityArgs struct {
	Networks           []PeerNetwork
	ProtectConnections bool
	Tags               map[string]string
}

// Connectivity represents direct peering between the configured VPCs.
type Connectivity struct {
	pulumi.ResourceState
	peeringIDs map[string]pulumi.IDOutput
}

// PeeringID returns the ID of a configured connection by its pair name.
func (c *Connectivity) PeeringID(pair string) pulumi.IDOutput {
	return c.peeringIDs[pair]
}

// NewConnectivity creates pairwise peering connections and routes in every
// private subnet route table. It expects two to four VPCs in the same AWS account
// and region; VPC peering does not provide transitive routing. Routes provide
// network paths only; endpoint exposure and security rules are managed by the
// consuming services.
func NewConnectivity(ctx *pulumi.Context, name string, args *ConnectivityArgs, opts ...pulumi.ResourceOption) (*Connectivity, error) {
	networks, err := validateConnectivityArgs(args)
	if err != nil {
		return nil, err
	}
	component := &Connectivity{peeringIDs: make(map[string]pulumi.IDOutput)}
	if err := ctx.RegisterComponentResource("kloudlab:network:Connectivity", name, component, opts...); err != nil {
		return nil, err
	}

	for left := 0; left < len(args.Networks); left++ {
		for right := left + 1; right < len(args.Networks); right++ {
			requester, accepter := args.Networks[left], args.Networks[right]
			pair := requester.Name + "-" + accepter.Name
			peering, err := createPeering(ctx, component, name, pair, networks[requester.Name], networks[accepter.Name], args)
			if err != nil {
				return nil, err
			}
			component.peeringIDs[pair] = peering.ID()
		}
	}

	outputs := pulumi.Map{}
	for pair, peeringID := range component.peeringIDs {
		outputs[pair] = peeringID
	}
	if err := ctx.RegisterResourceOutputs(component, pulumi.Map{"peeringIds": outputs}); err != nil {
		return nil, err
	}
	return component, nil
}

func validateConnectivityArgs(args *ConnectivityArgs) (map[string]PeerNetwork, error) {
	if args == nil {
		return nil, fmt.Errorf("connectivity arguments are required")
	}
	if len(args.Networks) < 2 || len(args.Networks) > 4 {
		return nil, fmt.Errorf("connectivity requires between two and four VPCs")
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
		if len(network.PrivateRouteTableIDs) < 2 {
			return nil, fmt.Errorf("VPC %q must provide at least two private route tables", network.Name)
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
		VpcId:      requester.VPCID,
		PeerVpcId:  accepter.VPCID,
		AutoAccept: pulumi.Bool(true),
		Requester: &ec2.VpcPeeringConnectionRequesterArgs{
			AllowRemoteVpcDnsResolution: pulumi.Bool(true),
		},
		Accepter: &ec2.VpcPeeringConnectionAccepterTypeArgs{
			AllowRemoteVpcDnsResolution: pulumi.Bool(true),
		},
		Tags: makeTags(args.Tags, peeringName),
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
			RouteTableId:           routeTableID,
			DestinationCidrBlock:   remote.CIDRBlock,
			VpcPeeringConnectionId: peering.ID(),
		}, pulumi.Parent(parent), pulumi.Protect(protect))
		if err != nil {
			return err
		}
	}
	return nil
}
