// Package network defines reusable AWS VPC components.
package network

import "github.com/pulumi/pulumi/sdk/v3/go/pulumi"

// NATGatewayMode selects the egress availability and NAT gateway cost profile.
type NATGatewayMode string

const (
	// NATGatewaySingle creates one NAT gateway shared by all private AZs.
	NATGatewaySingle NATGatewayMode = "single"
	// NATGatewayPerAZ creates a NAT gateway in each public AZ.
	NATGatewayPerAZ NATGatewayMode = "per-az"
)

// Args describes a VPC without embedding account-specific CIDRs or AZ names.
type Args struct {
	Environment        string
	Region             string
	CIDRBlock          string
	OtherCIDRs         []string
	AvailabilityZones  []string
	SubnetPrefixLength int
	NATGatewayMode     NATGatewayMode
	ProtectVPC         bool
	Tags               map[string]string
}

// Component exposes outputs required by cluster and connectivity stacks.
type Component interface {
	pulumi.Resource
	VPCID() pulumi.StringOutput
	CIDRBlock() pulumi.StringOutput
	PublicSubnetIDs() pulumi.StringArrayOutput
	PrivateSubnetIDs() pulumi.StringArrayOutput
	PublicRouteTableID() pulumi.StringOutput
	PrivateRouteTableIDs() pulumi.StringArrayOutput
	S3GatewayEndpointID() pulumi.IDOutput
	EKSAuthEndpointID() pulumi.IDOutput
}
