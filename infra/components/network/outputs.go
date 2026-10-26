package network

import "github.com/pulumi/pulumi/sdk/v3/go/pulumi"

// VPC is a reusable VPC, subnet, routing, and egress component.
type VPC struct {
	pulumi.ResourceState

	vpcID                pulumi.StringOutput
	cidrBlock            pulumi.StringOutput
	publicSubnetIDs      pulumi.StringArrayOutput
	privateSubnetIDs     pulumi.StringArrayOutput
	publicRouteTableID   pulumi.StringOutput
	privateRouteTableIDs pulumi.StringArrayOutput
	s3GatewayEndpointID  pulumi.IDOutput
}

// VPCID returns the AWS VPC identifier.
func (v *VPC) VPCID() pulumi.StringOutput { return v.vpcID }

// CIDRBlock returns the primary VPC IPv4 prefix.
func (v *VPC) CIDRBlock() pulumi.StringOutput { return v.cidrBlock }

// PublicSubnetIDs returns public load balancer subnet identifiers by AZ.
func (v *VPC) PublicSubnetIDs() pulumi.StringArrayOutput { return v.publicSubnetIDs }

// PrivateSubnetIDs returns private worker subnet identifiers by AZ.
func (v *VPC) PrivateSubnetIDs() pulumi.StringArrayOutput { return v.privateSubnetIDs }

// PublicRouteTableID returns the shared public subnet route table identifier.
func (v *VPC) PublicRouteTableID() pulumi.StringOutput { return v.publicRouteTableID }

// PrivateRouteTableIDs returns one private route table identifier per AZ.
func (v *VPC) PrivateRouteTableIDs() pulumi.StringArrayOutput { return v.privateRouteTableIDs }

// S3GatewayEndpointID returns the S3 gateway endpoint identifier.
func (v *VPC) S3GatewayEndpointID() pulumi.IDOutput { return v.s3GatewayEndpointID }
