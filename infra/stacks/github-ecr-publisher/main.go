package main

import (
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/iam"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	pulumiconfig "github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"

	kloudiam "github.com/harishsudalaimani/kloudlab/infra/components/iam"
	"github.com/harishsudalaimani/kloudlab/infra/config"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		stackConfig := pulumiconfig.New(ctx, "kloudlab-github-ecr-publisher")
		awsConfig := pulumiconfig.New(ctx, "aws")
		common := config.Common{
			Project:     "kloudlab",
			Environment: stackConfig.Require("environment"),
			Region:      awsConfig.Require("region"),
		}
		if err := common.Validate(); err != nil {
			return err
		}

		provider, err := iam.LookupOpenIdConnectProvider(ctx, &iam.LookupOpenIdConnectProviderArgs{
			Url: pulumi.StringRef("https://token.actions.githubusercontent.com"),
		})
		if err != nil {
			return err
		}

		var branches []string
		if err := stackConfig.GetObject("branches", &branches); err != nil {
			return err
		}
		roleName, err := config.ResourcePrefix("kloudlab", common.Environment, "github-ecr-publisher")
		if err != nil {
			return err
		}
		name, err := config.ResourcePrefix("kloudlab", common.Environment, "github-ecr-publisher")
		if err != nil {
			return err
		}
		tags, err := config.BuildTags(common, "github-ecr-publisher", nil)
		if err != nil {
			return err
		}
		role, err := kloudiam.NewGitHubActionsRoleWithProvider(ctx, name, &kloudiam.GitHubActionsRoleArgs{
			RoleName:          roleName,
			Repository:        stackConfig.Require("repository"),
			RepositoryOwnerID: stackConfig.Require("repositoryOwnerId"),
			RepositoryID:      stackConfig.Require("repositoryId"),
			Branches:          branches,
			PermissionsPolicy: kloudiam.GitHubActionsECRPublishPolicy(),
			PolicyDescription: "Publish KloudLab API and frontend images to ECR",
			Tags:              tags,
		}, pulumi.String(provider.Arn), pulumi.Protect(true))
		if err != nil {
			return err
		}
		ctx.Export("ecrPublisherRoleArn", role.RoleARN())
		return nil
	})
}
