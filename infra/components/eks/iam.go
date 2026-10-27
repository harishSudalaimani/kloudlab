package eks

import (
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/iam"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

const clusterAssumeRolePolicy = `{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"eks.amazonaws.com"},"Action":"sts:AssumeRole"}]}`

const nodeAssumeRolePolicy = `{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}`

func createClusterRole(ctx *pulumi.Context, parent pulumi.Resource, name string, tags pulumi.StringMapInput) (*iam.Role, []pulumi.Resource, error) {
	role, err := iam.NewRole(ctx, name+"-control-plane-role", &iam.RoleArgs{
		AssumeRolePolicy: pulumi.String(clusterAssumeRolePolicy),
		Description:      pulumi.String("EKS control plane role for " + name),
		Tags:             tags,
	}, pulumi.Parent(parent))
	if err != nil {
		return nil, nil, err
	}

	attachment, err := iam.NewRolePolicyAttachment(ctx, name+"-control-plane-policy", &iam.RolePolicyAttachmentArgs{
		Role:      role.Name,
		PolicyArn: pulumi.String("arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"),
	}, pulumi.Parent(parent), pulumi.DependsOn([]pulumi.Resource{role}))
	if err != nil {
		return nil, nil, err
	}
	return role, []pulumi.Resource{attachment}, nil
}

func createNodeRole(ctx *pulumi.Context, parent pulumi.Resource, name string, tags pulumi.StringMapInput) (*iam.Role, []pulumi.Resource, error) {
	role, err := iam.NewRole(ctx, name+"-node-role", &iam.RoleArgs{
		AssumeRolePolicy: pulumi.String(nodeAssumeRolePolicy),
		Description:      pulumi.String("EKS managed node role for " + name),
		Tags:             tags,
	}, pulumi.Parent(parent))
	if err != nil {
		return nil, nil, err
	}

	policyARNs := []string{
		"arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
		"arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly",
		"arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
	}
	attachments := make([]pulumi.Resource, 0, len(policyARNs))
	for index, policyARN := range policyARNs {
		attachment, err := iam.NewRolePolicyAttachment(ctx, fmt.Sprintf("%s-node-policy-%d", name, index+1), &iam.RolePolicyAttachmentArgs{
			Role:      role.Name,
			PolicyArn: pulumi.String(policyARN),
		}, pulumi.Parent(parent), pulumi.DependsOn([]pulumi.Resource{role}))
		if err != nil {
			return nil, nil, err
		}
		attachments = append(attachments, attachment)
	}
	return role, attachments, nil
}
