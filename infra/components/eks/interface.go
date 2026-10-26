// Package eks defines reusable EKS cluster and managed node group contracts.
package eks

import "github.com/pulumi/pulumi/sdk/v3/go/pulumi"

// Network exposes the network outputs needed by an EKS cluster.
type Network interface {
	VPCID() pulumi.StringOutput
	PrivateSubnetIDs() pulumi.StringArrayOutput
}

// ClusterArgs describes control plane inputs. Defaults and validation belong
// in an implementation, not in consumers of this contract.
type ClusterArgs struct {
	Name                  string
	KubernetesVersion     pulumi.StringInput
	Network               Network
	PublicEndpointAccess  pulumi.BoolInput
	PrivateEndpointAccess pulumi.BoolInput
	Tags                  pulumi.StringMapInput
}

// Cluster exposes outputs required by node groups and workload identity.
type Cluster interface {
	pulumi.Resource
	ClusterName() pulumi.StringOutput
	Endpoint() pulumi.StringOutput
	OIDCIssuerURL() pulumi.StringOutput
}

// NodeGroupArgs describes an EC2 managed node group without selecting an
// instance size or scaling policy on behalf of an environment.
type NodeGroupArgs struct {
	Name          string
	ClusterName   pulumi.StringInput
	SubnetIDs     pulumi.StringArrayInput
	InstanceTypes pulumi.StringArrayInput
	MinSize       pulumi.IntInput
	DesiredSize   pulumi.IntInput
	MaxSize       pulumi.IntInput
	DiskSizeGiB   pulumi.IntInput
	Tags          pulumi.StringMapInput
}

// NodeGroup exposes the role used by workloads scheduled onto the group.
type NodeGroup interface {
	pulumi.Resource
	NodeRoleARN() pulumi.StringOutput
}
