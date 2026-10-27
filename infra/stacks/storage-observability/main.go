package main

import (
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"

	"github.com/harishsudalaimani/kloudlab/infra/components/observability"
	kloudconfig "github.com/harishsudalaimani/kloudlab/infra/config"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		stackConfig := config.New(ctx, "kloudlab-storage")
		awsConfig := config.New(ctx, "aws")
		region := awsConfig.Require("region")
		clusterRef, err := pulumi.NewStackReference(ctx, "observability-cluster-reference", &pulumi.StackReferenceArgs{
			Name: pulumi.String(stackConfig.Require("clusterStack")),
		})
		if err != nil {
			return err
		}

		common := kloudconfig.Common{Project: "kloudlab", Environment: stackConfig.Require("environment"), Region: region}
		if err := common.Validate(); err != nil {
			return err
		}
		tags, err := kloudconfig.BuildTags(common, "storage-observability", nil)
		if err != nil {
			return err
		}
		pulumiTags := make(pulumi.StringMap, len(tags))
		for key, value := range tags {
			pulumiTags[key] = pulumi.String(value)
		}

		storage, err := observability.NewS3Stack(ctx, "kloudlab-observability-storage", &observability.S3StackArgs{
			Region:              region,
			ClusterName:         clusterRef.GetStringOutput(pulumi.String("clusterName")),
			Namespace:           stackConfig.Require("namespace"),
			LokiServiceAccount:  stackConfig.Require("lokiServiceAccount"),
			TempoServiceAccount: stackConfig.Require("tempoServiceAccount"),
			LogsBucketName:      stackConfig.Require("logsBucketName"),
			TracesBucketName:    stackConfig.Require("tracesBucketName"),
			LogRetentionDays:    stackConfig.RequireInt("logRetentionDays"),
			TraceRetentionDays:  stackConfig.RequireInt("traceRetentionDays"),
			Tags:                pulumiTags,
		})
		if err != nil {
			return err
		}
		ctx.Export("logsBucketName", storage.LogsBucketName())
		ctx.Export("tracesBucketName", storage.TracesBucketName())
		ctx.Export("lokiRoleArn", storage.LokiRoleARN())
		ctx.Export("tempoRoleArn", storage.TempoRoleARN())
		return nil
	})
}
