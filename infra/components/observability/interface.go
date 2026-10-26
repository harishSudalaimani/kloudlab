// Package observability defines durable telemetry infrastructure contracts.
package observability

import "github.com/pulumi/pulumi/sdk/v3/go/pulumi"

// ObjectStorageArgs describes private object storage for telemetry backends.
type ObjectStorageArgs struct {
	Name                  string
	VersioningEnabled     pulumi.BoolInput
	EncryptionEnabled     pulumi.BoolInput
	LogRetentionDays      pulumi.IntInput
	TraceRetentionDays    pulumi.IntInput
	Tags                  pulumi.StringMapInput
}

// ObjectStorage exposes bucket names, not credentials or unrestricted access.
type ObjectStorage interface {
	pulumi.Resource
	LogsBucketName() pulumi.StringOutput
	TracesBucketName() pulumi.StringOutput
}
