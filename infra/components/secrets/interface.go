// Package secrets defines infrastructure contracts for workload access to
// Infisical. Secret payloads are deliberately not represented as outputs.
package secrets

import "github.com/pulumi/pulumi/sdk/v3/go/pulumi"

// WorkloadAccessArgs describes a narrowly scoped workload identity binding.
type WorkloadAccessArgs struct {
	Name           string
	ClusterName    pulumi.StringInput
	Namespace      pulumi.StringInput
	ServiceAccount pulumi.StringInput
	ProjectID      pulumi.StringInput
	Environment    pulumi.StringInput
}

// WorkloadAccess exposes a non-secret identity reference only.
type WorkloadAccess interface {
	pulumi.Resource
	IdentityID() pulumi.StringOutput
}
