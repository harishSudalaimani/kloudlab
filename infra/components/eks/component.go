// Package eks creates EKS control planes, managed node groups, and their
// required cluster add-ons.
package eks

import "github.com/pulumi/pulumi/sdk/v3/go/pulumi"

// Network exposes the VPC outputs required by an EKS cluster.
type Network interface {
	VPCID() pulumi.StringOutput
	PrivateSubnetIDs() pulumi.StringArrayOutput
}

// ClusterArgs configures an EKS control plane and its baseline managed node
// group. Public API access is restricted to the explicitly supplied CIDRs;
// private API access remains enabled for peered cluster management.
type ClusterArgs struct {
	Name                   string
	KubernetesVersion      string
	Network                Network
	PublicEndpointAccess   bool
	PrivateEndpointAccess  bool
	PublicAccessCIDRs      []string
	ManagementCIDR         pulumi.StringInput
	InstanceTypes          []string
	MinSize                int
	DesiredSize            int
	MaxSize                int
	DiskSizeGiB            int
	ManageKubeProxy        bool
	HoldNodesForCilium     bool
	EnablePodIdentityAgent bool
	EnableEBSCSIDriver     bool
	ProtectCluster         bool
	Tags                   pulumi.StringMapInput
}

// Cluster exposes values used by GitOps bootstrap and workload identity.
type Cluster interface {
	pulumi.Resource
	ClusterName() pulumi.StringOutput
	Endpoint() pulumi.StringOutput
	OIDCIssuerURL() pulumi.StringOutput
	ClusterSecurityGroupID() pulumi.StringOutput
	NodeRoleARN() pulumi.StringOutput
	NodeGroupName() pulumi.StringOutput
}

// ClusterComponent owns the control plane, IAM roles, baseline node group,
// and EKS-managed system add-ons for one cluster.
type ClusterComponent struct {
	pulumi.ResourceState

	clusterName            pulumi.StringOutput
	endpoint               pulumi.StringOutput
	oidcIssuerURL          pulumi.StringOutput
	clusterSecurityGroupID pulumi.StringOutput
	nodeRoleARN            pulumi.StringOutput
	nodeGroupName          pulumi.StringOutput
}

// NodeGroup exposes the role used by workloads scheduled onto the group.
type NodeGroup interface {
	pulumi.Resource
	NodeRoleARN() pulumi.StringOutput
}
