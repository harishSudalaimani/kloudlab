package iam

import (
	"encoding/json"
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/cloudwatch"
	awsEks "github.com/pulumi/pulumi-aws/sdk/v7/go/aws/eks"
	awsIam "github.com/pulumi/pulumi-aws/sdk/v7/go/aws/iam"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/sqs"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

// KarpenterNodePolicies are the managed policies of nodes Karpenter
// launches; ECR pull-only, SSM for break-glass access instead of SSH.
var KarpenterNodePolicies = map[string]string{
	"worker": "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
	"cni":    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
	"ecr":    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly",
	"ssm":    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
}

// KarpenterInterruptionEvents feed the interruption queue so Karpenter
// drains nodes before AWS stops them.
var KarpenterInterruptionEvents = map[string]string{
	"health":    `{"source":["aws.health"],"detail-type":["AWS Health Event"]}`,
	"spot":      `{"source":["aws.ec2"],"detail-type":["EC2 Spot Instance Interruption Warning"]}`,
	"rebalance": `{"source":["aws.ec2"],"detail-type":["EC2 Instance Rebalance Recommendation"]}`,
	"state":     `{"source":["aws.ec2"],"detail-type":["EC2 Instance State-change Notification"]}`,
}

// NewKarpenterAccess creates what Karpenter needs on one cluster: the
// interruption SQS queue and its EventBridge rules, the node role (EKS
// access entry EC2_LINUX) and the controller role (Pod Identity for
// kube-system/karpenter). Names start with <clusterName>-karpenter.
func NewKarpenterAccess(ctx *pulumi.Context, clusterName string,
	tags pulumi.StringMap, opts ...pulumi.ResourceOption) error {
	base := clusterName + "-karpenter"

	queue, err := sqs.NewQueue(ctx, base, &sqs.QueueArgs{
		Name:                    pulumi.String(base),
		MessageRetentionSeconds: pulumi.Int(300),
		SqsManagedSseEnabled:    pulumi.Bool(true),
		Tags:                    tags,
	}, opts...)
	if err != nil {
		return err
	}
	queuePolicy := queue.Arn.ApplyT(func(arn string) (string, error) {
		doc, err := json.Marshal(map[string]any{
			"Version": "2012-10-17",
			"Statement": []map[string]any{{
				"Effect": "Allow",
				"Principal": map[string]any{
					"Service": []string{"events.amazonaws.com", "sqs.amazonaws.com"},
				},
				"Action":   "sqs:SendMessage",
				"Resource": arn,
			}},
		})
		return string(doc), err
	}).(pulumi.StringOutput)
	if _, err := sqs.NewQueuePolicy(ctx, base, &sqs.QueuePolicyArgs{
		QueueUrl: queue.Url,
		Policy:   queuePolicy,
	}, opts...); err != nil {
		return err
	}
	for kind, pattern := range KarpenterInterruptionEvents {
		name := base + "-" + kind
		rule, err := cloudwatch.NewEventRule(ctx, name, &cloudwatch.EventRuleArgs{
			Name:         pulumi.String(name),
			EventPattern: pulumi.String(pattern),
			Tags:         tags,
		}, opts...)
		if err != nil {
			return err
		}
		if _, err := cloudwatch.NewEventTarget(ctx, name, &cloudwatch.EventTargetArgs{
			Rule: rule.Name,
			Arn:  queue.Arn,
		}, opts...); err != nil {
			return err
		}
	}

	nodeRole, err := awsIam.NewRole(ctx, base+"-node", &awsIam.RoleArgs{
		Name:             pulumi.String(base + "-node"),
		Description:      pulumi.String("Nodes Karpenter launches in " + clusterName),
		AssumeRolePolicy: pulumi.String(`{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}`),
		Tags:             tags,
	}, opts...)
	if err != nil {
		return err
	}
	for short, arn := range KarpenterNodePolicies {
		if _, err := awsIam.NewRolePolicyAttachment(ctx, base+"-node-"+short,
			&awsIam.RolePolicyAttachmentArgs{
				Role:      nodeRole.Name,
				PolicyArn: pulumi.String(arn),
			}, opts...); err != nil {
			return err
		}
	}
	if _, err := awsEks.NewAccessEntry(ctx, base+"-node", &awsEks.AccessEntryArgs{
		ClusterName:  pulumi.String(clusterName),
		PrincipalArn: nodeRole.Arn,
		Type:         pulumi.String("EC2_LINUX"),
		Tags:         tags,
	}, opts...); err != nil {
		return err
	}

	controller, err := awsIam.NewRole(ctx, base+"-controller", &awsIam.RoleArgs{
		Name:             pulumi.String(base + "-controller"),
		Description:      pulumi.String("Karpenter controller of " + clusterName),
		AssumeRolePolicy: pulumi.String(podIdentityTrust),
		Tags:             tags,
	}, opts...)
	if err != nil {
		return err
	}
	controllerPolicy := pulumi.All(queue.Arn, nodeRole.Arn).ApplyT(
		func(args []any) (string, error) {
			queueArn, nodeRoleArn := args[0].(string), args[1].(string)
			return fmt.Sprintf(karpenterControllerPolicy, nodeRoleArn,
				clusterName, queueArn), nil
		}).(pulumi.StringOutput)
	if _, err := awsIam.NewRolePolicy(ctx, base+"-controller", &awsIam.RolePolicyArgs{
		Role:   controller.Name,
		Policy: controllerPolicy,
	}, opts...); err != nil {
		return err
	}
	if _, err := awsEks.NewPodIdentityAssociation(ctx, base+"-controller", &awsEks.PodIdentityAssociationArgs{
		ClusterName:    pulumi.String(clusterName),
		Namespace:      pulumi.String("kube-system"),
		ServiceAccount: pulumi.String("karpenter"),
		RoleArn:        controller.Arn,
		Tags:           tags,
	}, opts...); err != nil {
		return err
	}
	ctx.Export("karpenterNodeRoleName", nodeRole.Name)
	ctx.Export("karpenterInterruptionQueue", queue.Name)
	return nil
}

// POC scope: EC2 and instance-profile actions on "*"; tighten to the
// upstream per-resource conditions before production. %s: node role ARN,
// cluster name, queue ARN.
const karpenterControllerPolicy = `{
  "Version": "2012-10-17",
  "Statement": [
    {"Sid": "EC2", "Effect": "Allow", "Resource": "*", "Action": [
      "ec2:CreateFleet", "ec2:CreateLaunchTemplate", "ec2:CreateTags",
      "ec2:DeleteLaunchTemplate", "ec2:RunInstances",
      "ec2:TerminateInstances", "ec2:DescribeAvailabilityZones",
      "ec2:DescribeImages", "ec2:DescribeInstances",
      "ec2:DescribeInstanceTypeOfferings", "ec2:DescribeInstanceTypes",
      "ec2:DescribeLaunchTemplates", "ec2:DescribeSecurityGroups",
      "ec2:DescribeSpotPriceHistory", "ec2:DescribeSubnets"]},
    {"Sid": "PassNodeRole", "Effect": "Allow", "Action": "iam:PassRole",
      "Resource": "%s",
      "Condition": {"StringEquals": {"iam:PassedToService": "ec2.amazonaws.com"}}},
    {"Sid": "InstanceProfiles", "Effect": "Allow", "Resource": "*", "Action": [
      "iam:CreateInstanceProfile", "iam:TagInstanceProfile",
      "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile",
      "iam:DeleteInstanceProfile", "iam:GetInstanceProfile",
      "iam:ListInstanceProfiles"]},
    {"Sid": "Cluster", "Effect": "Allow", "Action": "eks:DescribeCluster",
      "Resource": "arn:aws:eks:*:*:cluster/%s"},
    {"Sid": "Interruption", "Effect": "Allow", "Resource": "%s", "Action": [
      "sqs:DeleteMessage", "sqs:GetQueueUrl", "sqs:ReceiveMessage"]},
    {"Sid": "Lookups", "Effect": "Allow", "Resource": "*", "Action": [
      "ssm:GetParameter", "pricing:GetProducts"]}
  ]
}`
