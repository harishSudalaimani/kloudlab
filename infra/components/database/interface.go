// Package database defines private PostgreSQL component contracts.
package database

import "github.com/pulumi/pulumi/sdk/v3/go/pulumi"

// PostgreSQLArgs describes a private database. Passwords and secret values are
// intentionally absent; credentials must be provisioned through the approved
// secrets workflow.
type PostgreSQLArgs struct {
	Name                string
	EngineVersion       pulumi.StringInput
	InstanceClass       pulumi.StringInput
	SubnetIDs           pulumi.StringArrayInput
	SecurityGroupIDs    pulumi.StringArrayInput
	AllocatedStorageGiB pulumi.IntInput
	MultiAZ             pulumi.BoolInput
	BackupRetentionDays pulumi.IntInput
	DeletionProtection  pulumi.BoolInput
	Tags                pulumi.StringMapInput
}

// PostgreSQL exposes connection coordinates, never credentials.
type PostgreSQL interface {
	pulumi.Resource
	Address() pulumi.StringOutput
	Port() pulumi.IntOutput
}
