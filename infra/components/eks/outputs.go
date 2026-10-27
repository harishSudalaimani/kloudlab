package eks

import "github.com/pulumi/pulumi/sdk/v3/go/pulumi"

func (c *ClusterComponent) ClusterName() pulumi.StringOutput {
	return c.clusterName
}

func (c *ClusterComponent) Endpoint() pulumi.StringOutput {
	return c.endpoint
}

func (c *ClusterComponent) CertificateAuthorityData() pulumi.StringOutput {
	return c.certificateAuthorityData
}

func (c *ClusterComponent) OIDCIssuerURL() pulumi.StringOutput {
	return c.oidcIssuerURL
}

func (c *ClusterComponent) ClusterSecurityGroupID() pulumi.StringOutput {
	return c.clusterSecurityGroupID
}

func (c *ClusterComponent) NodeRoleARN() pulumi.StringOutput {
	return c.nodeRoleARN
}

func (c *ClusterComponent) NodeGroupName() pulumi.StringOutput {
	return c.nodeGroupName
}
