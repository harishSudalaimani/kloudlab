package iam

import (
	_ "embed"

	awsEks "github.com/pulumi/pulumi-aws/sdk/v7/go/aws/eks"
	awsIam "github.com/pulumi/pulumi-aws/sdk/v7/go/aws/iam"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

// Vendored by scripts/vendor-aws-load-balancer-controller-policy.sh; keep
// the version equal to the controller image tag.
//
//go:embed policies/aws-load-balancer-controller-v3.6.1.json
var loadBalancerControllerPolicy string

const podIdentityTrust = `{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"pods.eks.amazonaws.com"},"Action":["sts:AssumeRole","sts:TagSession"]}]}`

// NewLoadBalancerControllerAccess gives the AWS Load Balancer Controller
// of one cluster (service account kube-system/aws-load-balancer-controller)
// its upstream IAM policy through EKS Pod Identity. Resource names start
// with <clusterName>-aws-load-balancer-controller.
func NewLoadBalancerControllerAccess(ctx *pulumi.Context, clusterName string,
	tags pulumi.StringMap, opts ...pulumi.ResourceOption) (pulumi.StringOutput, error) {
	name := clusterName + "-aws-load-balancer-controller"
	role, err := awsIam.NewRole(ctx, name, &awsIam.RoleArgs{
		Name:             pulumi.String(name),
		Description:      pulumi.String("AWS Load Balancer Controller of " + clusterName),
		AssumeRolePolicy: pulumi.String(podIdentityTrust),
		Tags:             tags,
	}, opts...)
	if err != nil {
		return pulumi.StringOutput{}, err
	}
	policy, err := awsIam.NewPolicy(ctx, name, &awsIam.PolicyArgs{
		Name:   pulumi.String(name),
		Policy: pulumi.String(loadBalancerControllerPolicy),
		Tags:   tags,
	}, opts...)
	if err != nil {
		return pulumi.StringOutput{}, err
	}
	if _, err := awsIam.NewRolePolicyAttachment(ctx, name, &awsIam.RolePolicyAttachmentArgs{
		Role:      role.Name,
		PolicyArn: policy.Arn,
	}, opts...); err != nil {
		return pulumi.StringOutput{}, err
	}
	if _, err := awsEks.NewPodIdentityAssociation(ctx, name, &awsEks.PodIdentityAssociationArgs{
		ClusterName:    pulumi.String(clusterName),
		Namespace:      pulumi.String("kube-system"),
		ServiceAccount: pulumi.String("aws-load-balancer-controller"),
		RoleArn:        role.Arn,
		Tags:           tags,
	}, opts...); err != nil {
		return pulumi.StringOutput{}, err
	}
	return role.Arn, nil
}
