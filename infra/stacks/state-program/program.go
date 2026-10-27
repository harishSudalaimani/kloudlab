package stateprogram

import (
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	pulumiconfig "github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"

	"github.com/harishsudalaimani/kloudlab/infra/components/backend"
	"github.com/harishsudalaimani/kloudlab/infra/config"
)

// Run creates the protected remote state bucket and KMS key.
func Run(ctx *pulumi.Context) error {
	stackConfig := pulumiconfig.New(ctx, "kloudlab-state")
	awsConfig := pulumiconfig.New(ctx, "aws")
	common := config.Common{
		Project:     "kloudlab",
		Environment: stackConfig.Require("environment"),
		Region:      awsConfig.Require("region"),
	}
	if err := common.Validate(); err != nil {
		return err
	}
	tags, err := config.BuildTags(common, "bootstrap-state", nil)
	if err != nil {
		return err
	}
	state, err := backend.NewStateBackend(ctx, "kloudlab-pulumi-state", &backend.StateBackendArgs{
		BucketName: stackConfig.Require("bucketName"),
		Tags:       tags,
	})
	if err != nil {
		return err
	}
	ctx.Export("bucketName", state.BucketName())
	ctx.Export("bucketArn", state.BucketARN())
	ctx.Export("kmsKeyArn", state.KMSKeyARN())
	ctx.Export("kmsAlias", pulumi.String("alias/kloudlab-pulumi-state"))
	return nil
}
