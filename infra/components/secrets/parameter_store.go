package secrets

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/eks"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/iam"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/kms"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

// ParameterStoreAccessArgs describes the workload identity and SSM path that
// the External Secrets Operator controller may read.
type ParameterStoreAccessArgs struct {
	Region              string
	ClusterName         pulumi.StringInput
	Namespace           string
	ServiceAccount      string
	ParameterPathPrefix string
	Tags                pulumi.StringMap
}

// ParameterStoreAccess exposes only the role ARN; parameter values remain in
// AWS Systems Manager Parameter Store.
type ParameterStoreAccess struct {
	pulumi.ResourceState
	roleARN pulumi.StringOutput
	keyARN  pulumi.StringOutput
}

func (a *ParameterStoreAccess) RoleARN() pulumi.StringOutput { return a.roleARN }
func (a *ParameterStoreAccess) KeyARN() pulumi.StringOutput  { return a.keyARN }

// NewParameterStoreAccess creates a least-privilege EKS Pod Identity role for
// an External Secrets Operator controller reading one SSM parameter path.
func NewParameterStoreAccess(ctx *pulumi.Context, name string, args *ParameterStoreAccessArgs, opts ...pulumi.ResourceOption) (*ParameterStoreAccess, error) {
	if args == nil || args.Region == "" || args.ClusterName == nil || args.Namespace == "" || args.ServiceAccount == "" || args.ParameterPathPrefix == "" {
		return nil, fmt.Errorf("region, cluster, namespace, service account, and parameter path prefix are required")
	}
	component := &ParameterStoreAccess{}
	if err := ctx.RegisterComponentResource("kloudlab:secrets:ParameterStoreAccess", name, component, opts...); err != nil {
		return nil, err
	}
	tags := args.Tags
	if tags == nil {
		tags = pulumi.StringMap{}
	}
	caller, err := aws.GetCallerIdentity(ctx, &aws.GetCallerIdentityArgs{})
	if err != nil {
		return nil, fmt.Errorf("get AWS account for SSM Pod Identity trust: %w", err)
	}
	clusterARN := args.ClusterName.ToStringOutput().ApplyT(func(clusterName string) string {
		return fmt.Sprintf("arn:aws:eks:%s:%s:cluster/%s", args.Region, caller.AccountId, clusterName)
	}).(pulumi.StringOutput)
	trust := clusterARN.ApplyT(func(arn string) (string, error) {
		policy, err := json.Marshal(map[string]any{
			"Version": "2012-10-17",
			"Statement": []any{map[string]any{
				"Effect":    "Allow",
				"Principal": map[string]string{"Service": "pods.eks.amazonaws.com"},
				"Action":    []string{"sts:AssumeRole", "sts:TagSession"},
				"Condition": map[string]any{"StringEquals": map[string]string{
					"aws:RequestTag/eks-cluster-arn":            arn,
					"aws:RequestTag/kubernetes-namespace":       args.Namespace,
					"aws:RequestTag/kubernetes-service-account": args.ServiceAccount,
				}},
			}},
		})
		return string(policy), err
	}).(pulumi.StringOutput)
	roleName := "kloudlab-identity-external-secrets"
	role, err := iam.NewRole(ctx, name+"-role", &iam.RoleArgs{
		Name:             pulumi.String(roleName),
		Description:      pulumi.String("EKS Pod Identity role for reading KloudLab OpenFGA parameters"),
		AssumeRolePolicy: trust,
		Tags:             tags,
	}, pulumi.Parent(component))
	if err != nil {
		return nil, err
	}
	parameterPath := strings.Trim(args.ParameterPathPrefix, "/")
	resourceARN := fmt.Sprintf("arn:aws:ssm:%s:%s:parameter/%s/*", args.Region, caller.AccountId, parameterPath)
	key, err := kms.NewKey(ctx, name+"-kms-key", &kms.KeyArgs{
		Description:          pulumi.StringPtr("Encrypt KloudLab identity OpenFGA SSM parameters"),
		EnableKeyRotation:    pulumi.BoolPtr(true),
		DeletionWindowInDays: pulumi.IntPtr(30),
		Tags:                 tags,
	}, pulumi.Parent(component), pulumi.Protect(true))
	if err != nil {
		return nil, err
	}
	_, err = kms.NewAlias(ctx, name+"-kms-alias", &kms.AliasArgs{
		Name:        pulumi.String("alias/kloudlab-identity-ssm"),
		TargetKeyId: key.KeyId,
	}, pulumi.Parent(component), pulumi.DependsOn([]pulumi.Resource{key}))
	if err != nil {
		return nil, err
	}
	kmsContextARN := fmt.Sprintf("arn:aws:ssm:%s:%s:parameter/%s/*", args.Region, caller.AccountId, parameterPath)
	policyDocument := key.Arn.ApplyT(func(keyARN string) (string, error) {
		policy, err := json.Marshal(map[string]any{
			"Version": "2012-10-17",
			"Statement": []any{
				map[string]any{
					"Effect":   "Allow",
					"Action":   []string{"ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"},
					"Resource": resourceARN,
				},
				map[string]any{
					"Effect": "Allow", "Action": []string{"kms:Decrypt"}, "Resource": keyARN,
					"Condition": map[string]any{
						"StringEquals": map[string]string{"kms:ViaService": "ssm." + args.Region + ".amazonaws.com"},
						"StringLike":   map[string]string{"kms:EncryptionContext:PARAMETER_ARN": kmsContextARN},
					},
				},
			},
		})
		return string(policy), err
	}).(pulumi.StringOutput)
	policy, err := iam.NewPolicy(ctx, name+"-read-policy", &iam.PolicyArgs{
		Name:        pulumi.String(roleName + "-read-parameters"),
		Description: pulumi.String("Read only OpenFGA parameters from the KloudLab identity path"),
		Policy:      policyDocument,
		Tags:        tags,
	}, pulumi.Parent(component))
	if err != nil {
		return nil, err
	}
	attachment, err := iam.NewRolePolicyAttachment(ctx, name+"-read-policy-attachment", &iam.RolePolicyAttachmentArgs{
		Role: role.Name, PolicyArn: policy.Arn,
	}, pulumi.Parent(component), pulumi.DependsOn([]pulumi.Resource{role, policy}))
	if err != nil {
		return nil, err
	}
	_, err = eks.NewPodIdentityAssociation(ctx, name+"-pod-identity", &eks.PodIdentityAssociationArgs{
		ClusterName: args.ClusterName, Namespace: pulumi.String(args.Namespace),
		ServiceAccount: pulumi.String(args.ServiceAccount), RoleArn: role.Arn, Tags: tags,
	}, pulumi.Parent(component), pulumi.DependsOn([]pulumi.Resource{role, attachment}))
	if err != nil {
		return nil, err
	}
	component.roleARN = role.Arn
	component.keyARN = key.Arn
	if err := ctx.RegisterResourceOutputs(component, pulumi.Map{"roleArn": component.roleARN, "kmsKeyArn": component.keyARN}); err != nil {
		return nil, err
	}
	return component, nil
}
