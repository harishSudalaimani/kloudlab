package main

import (
	"fmt"
	"os"

	awsEks "github.com/pulumi/pulumi-aws/sdk/v7/go/aws/eks"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/iam"
	k8scorev1 "github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes/core/v1"
	"github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes/helm/v3"
	k8smetav1 "github.com/pulumi/pulumi-kubernetes/sdk/v4/go/kubernetes/meta/v1"
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
			Atomic:           pulumi.Bool(true),
			Timeout:          pulumi.Int(600),
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

		if stackConfig.GetBool("bootstrapManagementGateway") {
			policyJSON, err := os.ReadFile("../../../infra/components/iam/policies/aws-load-balancer-controller-v3.6.1.json")
			if err != nil {
				return fmt.Errorf("load pinned AWS Load Balancer Controller policy; run scripts/vendor-aws-load-balancer-controller-policy.sh first: %w", err)
			}

			const roleName = "kloudlab-management-aws-load-balancer-controller"
			role, err := iam.NewRole(ctx, "management-aws-load-balancer-controller-role", &iam.RoleArgs{
				Name:             pulumi.String(roleName),
				Description:      pulumi.String("EKS Pod Identity role for the management cluster AWS Load Balancer Controller"),
				AssumeRolePolicy: pulumi.String(`{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"pods.eks.amazonaws.com"},"Action":["sts:AssumeRole","sts:TagSession"]}]}`),
			})
			if err != nil {
				return err
			}
			policy, err := iam.NewPolicy(ctx, "management-aws-load-balancer-controller-policy", &iam.PolicyArgs{
				Name:        pulumi.String(roleName),
				Description: pulumi.String("Pinned upstream AWS Load Balancer Controller v3.6.1 permissions"),
				Policy:      pulumi.String(string(policyJSON)),
			})
			if err != nil {
				return err
			}
			attachment, err := iam.NewRolePolicyAttachment(ctx, "management-aws-load-balancer-controller-policy-attachment", &iam.RolePolicyAttachmentArgs{
				Role:      role.Name,
				PolicyArn: policy.Arn,
			}, pulumi.DependsOn([]pulumi.Resource{role, policy}))
			if err != nil {
				return err
			}
			association, err := awsEks.NewPodIdentityAssociation(ctx, "management-aws-load-balancer-controller-pod-identity", &awsEks.PodIdentityAssociationArgs{
				ClusterName:    pulumi.String("kloudlab-management"),
				Namespace:      pulumi.String("kube-system"),
				ServiceAccount: pulumi.String("aws-load-balancer-controller"),
				RoleArn:        role.Arn,
			}, pulumi.DependsOn([]pulumi.Resource{attachment}))
			if err != nil {
				return err
			}

			certManagerNamespace, err := k8scorev1.NewNamespace(ctx, "management-cert-manager-namespace", &k8scorev1.NamespaceArgs{
				Metadata: &k8smetav1.ObjectMetaArgs{Name: pulumi.String("cert-manager")},
			})
			if err != nil {
				return err
			}
			dnsToken, err := k8scorev1.NewSecret(ctx, "management-cloudflare-dns-api-token", &k8scorev1.SecretArgs{
				Metadata: &k8smetav1.ObjectMetaArgs{
					Name:      pulumi.String("cloudflare-dns-api-token"),
					Namespace: pulumi.String("cert-manager"),
				},
				StringData: pulumi.StringMap{"api-token": stackConfig.RequireSecret("cloudflareDnsApiToken")},
				Type:       pulumi.String("Opaque"),
			}, pulumi.DependsOn([]pulumi.Resource{certManagerNamespace}))
			if err != nil {
				return err
			}

			_, err = k8syaml.NewConfigFile(ctx, "argocd-management-gateway-root", &k8syaml.ConfigFileArgs{
				File: "../../../gitops/management/roots/management-gateway.yaml",
			}, pulumi.DependsOn([]pulumi.Resource{argocdRelease, association, dnsToken}))
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
