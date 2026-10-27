package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws"
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
		stackConfig := config.New(ctx, "kloudlab-argocd-management")
		awsConfig := config.New(ctx, "aws")
		var releaseOptions []pulumi.ResourceOption
		if stackConfig.GetBool("enableCrossClusterAccess") {
			roleArn, association, err := createArgoControllerAccess(ctx, awsConfig.Require("region"))
			if err != nil {
				return err
			}
			ctx.Export("applicationControllerRoleArn", roleArn)
			releaseOptions = append(releaseOptions, pulumi.DependsOn([]pulumi.Resource{association}))
		}

		argocdRelease, err := helm.NewRelease(ctx, "argocd", &helm.ReleaseArgs{
			Chart:            pulumi.String("../../../charts/argocd"),
			Name:             pulumi.String("argocd"),
			Namespace:        pulumi.String("argocd"),
			CreateNamespace:  pulumi.Bool(true),
			DependencyUpdate: pulumi.Bool(true),
			Atomic:           pulumi.Bool(true),
			Timeout:          pulumi.Int(600),
		}, releaseOptions...)
		if err != nil {
			return err
		}

		dependsOnArgoCD := pulumi.DependsOn([]pulumi.Resource{argocdRelease})

		if stackConfig.GetBool("registerWorkloadClusters") {
			if !stackConfig.GetBool("enableCrossClusterAccess") {
				return fmt.Errorf("enableCrossClusterAccess must be enabled before registering workload clusters")
			}
			for _, target := range []struct {
				name    string
				project string
				stack   string
			}{
				{name: "kloudlab-identity", project: "kloudlab-identity", stack: "organization/kloudlab-cluster-identity/dev"},
				{name: "kloudlab-app", project: "kloudlab-app", stack: "organization/kloudlab-cluster-app/dev"},
				{name: "kloudlab-observability", project: "kloudlab-observability", stack: "organization/kloudlab-cluster-observability/dev"},
			} {
				if err := registerWorkloadCluster(ctx, target.name, target.project, target.stack, argocdRelease); err != nil {
					return err
				}
			}
		}

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

		return err
	})
}

func createArgoControllerAccess(ctx *pulumi.Context, region string) (pulumi.StringOutput, pulumi.Resource, error) {
	caller, err := aws.GetCallerIdentity(ctx, &aws.GetCallerIdentityArgs{})
	if err != nil {
		return pulumi.StringOutput{}, nil, fmt.Errorf("get AWS account for Argo controller role: %w", err)
	}
	const roleName = "kloudlab-management-argocd-controller"
	clusterArn := fmt.Sprintf("arn:aws:eks:%s:%s:cluster/kloudlab-management", region, caller.AccountId)
	trustPolicyJSON, err := json.Marshal(map[string]any{
		"Version": "2012-10-17",
		"Statement": []any{map[string]any{
			"Effect":    "Allow",
			"Principal": map[string]string{"Service": "pods.eks.amazonaws.com"},
			"Action":    []string{"sts:AssumeRole", "sts:TagSession"},
			"Condition": map[string]any{"StringEquals": map[string]string{
				"aws:RequestTag/eks-cluster-arn":            clusterArn,
				"aws:RequestTag/kubernetes-namespace":       "argocd",
				"aws:RequestTag/kubernetes-service-account": "argocd-application-controller",
			}},
		}},
	})
	if err != nil {
		return pulumi.StringOutput{}, nil, err
	}
	role, err := iam.NewRole(ctx, "management-argocd-controller-role", &iam.RoleArgs{
		Name:             pulumi.String(roleName),
		Description:      pulumi.String("EKS Pod Identity role for Argo CD to assume per-workload-cluster deployment roles"),
		AssumeRolePolicy: pulumi.String(string(trustPolicyJSON)),
	})
	if err != nil {
		return pulumi.StringOutput{}, nil, err
	}

	roleResources := []string{
		fmt.Sprintf("arn:aws:iam::%s:role/kloudlab-identity-argocd-deployer", caller.AccountId),
		fmt.Sprintf("arn:aws:iam::%s:role/kloudlab-app-argocd-deployer", caller.AccountId),
		fmt.Sprintf("arn:aws:iam::%s:role/kloudlab-observability-argocd-deployer", caller.AccountId),
	}
	clusterResources := []string{
		fmt.Sprintf("arn:aws:eks:%s:%s:cluster/kloudlab-identity", region, caller.AccountId),
		fmt.Sprintf("arn:aws:eks:%s:%s:cluster/kloudlab-app", region, caller.AccountId),
		fmt.Sprintf("arn:aws:eks:%s:%s:cluster/kloudlab-observability", region, caller.AccountId),
	}
	policyJSON, err := json.Marshal(map[string]any{
		"Version": "2012-10-17",
		"Statement": []any{
			map[string]any{
				"Effect":   "Allow",
				// Pod Identity credentials carry session tags. Allow Argo's
				// role chain to pass those tags when it assumes a workload role.
				"Action":   []string{"sts:AssumeRole", "sts:TagSession"},
				"Resource": roleResources,
			},
			map[string]any{
				"Effect":   "Allow",
				"Action":   []string{"eks:DescribeCluster"},
				"Resource": clusterResources,
			},
		},
	})
	if err != nil {
		return pulumi.StringOutput{}, nil, err
	}
	policy, err := iam.NewPolicy(ctx, "management-argocd-controller-assume-workload-roles", &iam.PolicyArgs{
		Name:        pulumi.String(roleName),
		Description: pulumi.String("Allow Argo CD to assume only KloudLab workload-cluster deploy roles"),
		Policy:      pulumi.String(string(policyJSON)),
	})
	if err != nil {
		return pulumi.StringOutput{}, nil, err
	}
	attachment, err := iam.NewRolePolicyAttachment(ctx, "management-argocd-controller-assume-workload-roles-attachment", &iam.RolePolicyAttachmentArgs{
		Role:      role.Name,
		PolicyArn: policy.Arn,
	}, pulumi.DependsOn([]pulumi.Resource{role, policy}))
	if err != nil {
		return pulumi.StringOutput{}, nil, err
	}
	association, err := awsEks.NewPodIdentityAssociation(ctx, "management-argocd-controller-pod-identity", &awsEks.PodIdentityAssociationArgs{
		ClusterName:    pulumi.String("kloudlab-management"),
		Namespace:      pulumi.String("argocd"),
		ServiceAccount: pulumi.String("argocd-application-controller"),
		RoleArn:        role.Arn,
	}, pulumi.DependsOn([]pulumi.Resource{attachment}))
	if err != nil {
		return pulumi.StringOutput{}, nil, err
	}
	return role.Arn, association, nil
}

func registerWorkloadCluster(ctx *pulumi.Context, name, project, stackName string, argocdRelease pulumi.Resource) error {
	stack, err := pulumi.NewStackReference(ctx, name+"-cluster-registration-reference", &pulumi.StackReferenceArgs{
		Name: pulumi.String(stackName),
	})
	if err != nil {
		return err
	}
	endpoint := stack.GetStringOutput(pulumi.String("clusterEndpoint"))
	caData := stack.GetStringOutput(pulumi.String("clusterCertificateAuthorityData"))
	roleArn := stack.GetStringOutput(pulumi.String("argocdDeployerRoleArn"))
	config := pulumi.Sprintf(`{"awsAuthConfig":{"clusterName":%q,"roleARN":"%s"},"tlsClientConfig":{"insecure":false,"caData":"%s"}}`, name, roleArn, caData)
	labels := pulumi.StringMap{"argocd.argoproj.io/secret-type": pulumi.String("cluster")}
	_, err = k8scorev1.NewSecret(ctx, name+"-argocd-cluster", &k8scorev1.SecretArgs{
		Metadata: &k8smetav1.ObjectMetaArgs{
			Name:      pulumi.String("cluster-" + name),
			Namespace: pulumi.String("argocd"),
			Labels:    labels,
		},
		Type: pulumi.String("Opaque"),
		StringData: pulumi.StringMap{
			"name":    pulumi.String(name),
			"server":  endpoint,
			"project": pulumi.String(project),
			"config":  config,
		},
	}, pulumi.DependsOn([]pulumi.Resource{argocdRelease}))
	return err
}
