package main

import (
	"encoding/json"
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws"
	awsEks "github.com/pulumi/pulumi-aws/sdk/v7/go/aws/eks"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/iam"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		stackConfig := config.New(ctx, "kloudlab-argocd-management")
		awsConfig := config.New(ctx, "aws")
		if !stackConfig.GetBool("enableCrossClusterAccess") {
			return nil
		}

		roleArn, _, err := createArgoControllerAccess(ctx, awsConfig.Require("region"))
		if err != nil {
			return err
		}
		ctx.Export("applicationControllerRoleArn", roleArn)
		return nil
	})
}

// createArgoControllerAccess provisions only AWS identity infrastructure.
// Argo CD itself is installed from charts/argocd with Helm, and cluster
// registration is performed one cluster at a time after Argo is available.
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
