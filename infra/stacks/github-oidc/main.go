package main

import (
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"

	"github.com/harishsudalaimani/kloudlab/infra/components/iam"
	"github.com/harishsudalaimani/kloudlab/infra/config"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		stackConfig := pulumi.NewConfig(ctx, "kloudlab-github-oidc")
		awsConfig := pulumi.NewConfig(ctx, "aws")
		common := config.Common{
			Project:     "kloudlab",
			Environment: stackConfig.Require("environment"),
			Region:      awsConfig.Require("region"),
		}
		if err := common.Validate(); err != nil {
			return err
		}
		tags, err := config.BuildTags(common, "github-deployment-role", nil)
		if err != nil {
			return err
		}
		var branches []string
		if err := stackConfig.GetObject("branches", &branches); err != nil {
			return err
		}
		name, err := config.ResourcePrefix("kloudlab", common.Environment, "github-oidc")
		if err != nil {
			return err
		}
		role, err := iam.NewGitHubActionsRole(ctx, name, &iam.GitHubActionsRoleArgs{
			RoleName:          stackConfig.Require("roleName"),
			Repository:        stackConfig.Require("repository"),
			Branches:          branches,
			PermissionsPolicy: stackConfig.Require("permissionsPolicyJson"),
			Tags:              tags,
		}, pulumi.Protect(true))
		if err != nil {
			return err
		}
		ctx.Export("oidcProviderArn", role.ProviderARN())
		ctx.Export("deploymentRoleArn", role.RoleARN())
		return nil
	})
}
