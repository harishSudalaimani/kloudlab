package main

import (
	"github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes/helm/v3"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		_, err := helm.NewRelease(ctx, "argocd", &helm.ReleaseArgs{
			Chart:           pulumi.String("../../../charts/argocd"),
			Name:            pulumi.String("argocd"),
			Namespace:       pulumi.String("argocd"),
			CreateNamespace: pulumi.Bool(true),
			DependencyUpdate: pulumi.Bool(true),
			Atomic:           pulumi.Bool(true),
			Timeout:          pulumi.Int(600),
		})
		return err
	})
}
