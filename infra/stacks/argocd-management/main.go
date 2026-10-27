package main

import (
	"github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes/helm/v3"
	k8syaml "github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes/yaml"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		argocdRelease, err := helm.NewRelease(ctx, "argocd", &helm.ReleaseArgs{
			Chart:            pulumi.String("../../../charts/argocd"),
			Name:             pulumi.String("argocd"),
			Namespace:        pulumi.String("argocd"),
			CreateNamespace:  pulumi.Bool(true),
			DependencyUpdate: pulumi.Bool(true),
			Atomic:            pulumi.Bool(true),
			Timeout:           pulumi.Int(600),
		})
		if err != nil {
			return err
		}

		stackConfig := config.New(ctx, "kloudlab-argocd-management")
		dependsOnArgoCD := pulumi.DependsOn([]pulumi.Resource{argocdRelease})

		if stackConfig.GetBool("bootstrapManagementRoot") {
			_, err = k8syaml.NewConfigFile(ctx, "argocd-management-root", &k8syaml.ConfigFileArgs{
				File: "../../../gitops/management/roots/management.yaml",
			}, dependsOnArgoCD)
			if err != nil {
				return err
			}
		}

		if stackConfig.GetBool("bootstrapRootApplication") {
			_, err = k8syaml.NewConfigFile(ctx, "argocd-root-application", &k8syaml.ConfigFileArgs{
				File: "../../../gitops/management/root-application.yaml",
			}, dependsOnArgoCD)
		}
		return err
	})
}
