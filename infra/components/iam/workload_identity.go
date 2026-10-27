// Package iam defines workload identity contracts for Kubernetes workloads.
package iam

import "github.com/pulumi/pulumi/sdk/v3/go/pulumi"

// WorkloadIdentityArgs scopes a role to a cluster issuer and service account.
type WorkloadIdentityArgs struct {
	Name              string
	OIDCIssuerURL     pulumi.StringInput
	Namespace         pulumi.StringInput
	ServiceAccount    pulumi.StringInput
	AllowedPolicyARNs pulumi.StringArrayInput
	Tags              pulumi.StringMapInput
}

// WorkloadIdentity exposes the role reference, never credentials.
type WorkloadIdentity interface {
	pulumi.Resource
	RoleARN() pulumi.StringOutput
}
