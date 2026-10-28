// Package observability provisions durable, private telemetry object storage.
package observability

import (
	"encoding/json"
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/eks"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/iam"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/s3"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

// S3StackArgs defines isolated buckets and pod identities for Loki and Tempo.
type S3StackArgs struct {
	Region              string
	ClusterName         pulumi.StringInput
	Namespace           string
	LokiServiceAccount  string
	TempoServiceAccount string
	LogsBucketName      string
	TracesBucketName    string
	LogRetentionDays    int
	TraceRetentionDays  int
	Tags                pulumi.StringMap
}

// S3Stack exposes only bucket and role identifiers.
type S3Stack struct {
	pulumi.ResourceState
	logsBucket   pulumi.StringOutput
	tracesBucket pulumi.StringOutput
	lokiRoleARN  pulumi.StringOutput
	tempoRoleARN pulumi.StringOutput
}

func (s *S3Stack) LogsBucketName() pulumi.StringOutput   { return s.logsBucket }
func (s *S3Stack) TracesBucketName() pulumi.StringOutput { return s.tracesBucket }
func (s *S3Stack) LokiRoleARN() pulumi.StringOutput      { return s.lokiRoleARN }
func (s *S3Stack) TempoRoleARN() pulumi.StringOutput     { return s.tempoRoleARN }

// NewS3Stack creates two private encrypted buckets and separate Pod Identity
// roles. Loki and Tempo cannot access each other's bucket.
func NewS3Stack(ctx *pulumi.Context, name string, args *S3StackArgs, opts ...pulumi.ResourceOption) (*S3Stack, error) {
	if args == nil || args.Region == "" || args.ClusterName == nil || args.Namespace == "" || args.LokiServiceAccount == "" || args.TempoServiceAccount == "" {
		return nil, fmt.Errorf("region, cluster, namespace and service-account names are required")
	}
	if args.LogsBucketName == "" || args.TracesBucketName == "" || args.LogsBucketName == args.TracesBucketName || args.LogRetentionDays < 1 || args.TraceRetentionDays < 1 {
		return nil, fmt.Errorf("distinct bucket names and positive retention periods are required")
	}
	component := &S3Stack{}
	if err := ctx.RegisterComponentResource("kloudlab:observability:S3Storage", name, component, opts...); err != nil {
		return nil, err
	}
	tags := args.Tags
	if tags == nil {
		tags = pulumi.StringMap{}
	}

	logs, err := newTelemetryBucket(ctx, name+"-logs", args.LogsBucketName, args.LogRetentionDays, tags, component)
	if err != nil {
		return nil, err
	}
	traces, err := newTelemetryBucket(ctx, name+"-traces", args.TracesBucketName, args.TraceRetentionDays, tags, component)
	if err != nil {
		return nil, err
	}

	caller, err := aws.GetCallerIdentity(ctx, &aws.GetCallerIdentityArgs{})
	if err != nil {
		return nil, fmt.Errorf("get AWS account for EKS Pod Identity trust: %w", err)
	}
	clusterARN := args.ClusterName.ToStringOutput().ApplyT(func(clusterName string) string {
		return fmt.Sprintf("arn:aws:eks:%s:%s:cluster/%s", args.Region, caller.AccountId, clusterName)
	}).(pulumi.StringOutput)
	lokiRole, err := createS3PodRole(ctx, name+"-loki", clusterARN, args.Namespace, args.LokiServiceAccount, logs.Arn, tags, component)
	if err != nil {
		return nil, err
	}
	tempoRole, err := createS3PodRole(ctx, name+"-tempo", clusterARN, args.Namespace, args.TempoServiceAccount, traces.Arn, tags, component)
	if err != nil {
		return nil, err
	}
	_, err = eks.NewPodIdentityAssociation(ctx, name+"-loki-pod-identity", &eks.PodIdentityAssociationArgs{
		ClusterName: args.ClusterName, Namespace: pulumi.String(args.Namespace),
		ServiceAccount: pulumi.String(args.LokiServiceAccount), RoleArn: lokiRole.Arn,
		Tags: tags,
	}, pulumi.Parent(component), pulumi.DependsOn([]pulumi.Resource{lokiRole}))
	if err != nil {
		return nil, err
	}
	_, err = eks.NewPodIdentityAssociation(ctx, name+"-tempo-pod-identity", &eks.PodIdentityAssociationArgs{
		ClusterName: args.ClusterName, Namespace: pulumi.String(args.Namespace),
		ServiceAccount: pulumi.String(args.TempoServiceAccount), RoleArn: tempoRole.Arn,
		Tags: tags,
	}, pulumi.Parent(component), pulumi.DependsOn([]pulumi.Resource{tempoRole}))
	if err != nil {
		return nil, err
	}

	component.logsBucket = logs.Bucket
	component.tracesBucket = traces.Bucket
	component.lokiRoleARN = lokiRole.Arn
	component.tempoRoleARN = tempoRole.Arn
	if err := ctx.RegisterResourceOutputs(component, pulumi.Map{
		"logsBucketName": component.logsBucket, "tracesBucketName": component.tracesBucket,
		"lokiRoleArn": component.lokiRoleARN, "tempoRoleArn": component.tempoRoleARN,
	}); err != nil {
		return nil, err
	}
	return component, nil
}

//lint:ignore SA1019 Keep BucketV2 so existing protected telemetry buckets retain their Pulumi resource identity.
func newTelemetryBucket(ctx *pulumi.Context, name, bucketName string, retention int, tags pulumi.StringMap, parent pulumi.Resource) (*s3.BucketV2, error) {
	bucket, err := s3.NewBucketV2(ctx, name, &s3.BucketV2Args{
		Bucket: pulumi.String(bucketName), Tags: tags,
	}, pulumi.Parent(parent), pulumi.Protect(true))
	if err != nil {
		return nil, err
	}
	_, err = s3.NewBucketPublicAccessBlock(ctx, name+"-public-access", &s3.BucketPublicAccessBlockArgs{
		Bucket: bucket.ID(), BlockPublicAcls: pulumi.Bool(true), BlockPublicPolicy: pulumi.Bool(true),
		IgnorePublicAcls: pulumi.Bool(true), RestrictPublicBuckets: pulumi.Bool(true),
	}, pulumi.Parent(parent))
	if err != nil {
		return nil, err
	}
	_, err = s3.NewBucketServerSideEncryptionConfigurationV2(ctx, name+"-encryption", &s3.BucketServerSideEncryptionConfigurationV2Args{
		Bucket: bucket.ID(), Rules: s3.BucketServerSideEncryptionConfigurationV2RuleArray{
			&s3.BucketServerSideEncryptionConfigurationV2RuleArgs{
				ApplyServerSideEncryptionByDefault: &s3.BucketServerSideEncryptionConfigurationV2RuleApplyServerSideEncryptionByDefaultArgs{SseAlgorithm: pulumi.String("AES256")},
			},
		},
	}, pulumi.Parent(parent))
	if err != nil {
		return nil, err
	}
	_, err = s3.NewBucketVersioningV2(ctx, name+"-versioning", &s3.BucketVersioningV2Args{
		Bucket: bucket.ID(), VersioningConfiguration: &s3.BucketVersioningV2VersioningConfigurationArgs{Status: pulumi.String("Enabled")},
	}, pulumi.Parent(parent))
	if err != nil {
		return nil, err
	}
	_, err = s3.NewBucketLifecycleConfigurationV2(ctx, name+"-retention", &s3.BucketLifecycleConfigurationV2Args{
		Bucket: bucket.ID(), Rules: s3.BucketLifecycleConfigurationV2RuleArray{
			&s3.BucketLifecycleConfigurationV2RuleArgs{
				Id: pulumi.String("expire-telemetry"), Status: pulumi.String("Enabled"),
				Expiration:                     &s3.BucketLifecycleConfigurationV2RuleExpirationArgs{Days: pulumi.IntPtr(retention)},
				NoncurrentVersionExpiration:    &s3.BucketLifecycleConfigurationV2RuleNoncurrentVersionExpirationArgs{NoncurrentDays: pulumi.Int(retention)},
				AbortIncompleteMultipartUpload: &s3.BucketLifecycleConfigurationV2RuleAbortIncompleteMultipartUploadArgs{DaysAfterInitiation: pulumi.IntPtr(7)},
			},
		},
	}, pulumi.Parent(parent), pulumi.DependsOn([]pulumi.Resource{bucket}))
	if err != nil {
		return nil, err
	}
	policy, err := json.Marshal(map[string]any{
		"Version": "2012-10-17", "Statement": []any{map[string]any{
			"Sid": "DenyInsecureTransport", "Effect": "Deny", "Principal": "*", "Action": "s3:*",
			"Resource":  []string{fmt.Sprintf("arn:aws:s3:::%s", bucketName), fmt.Sprintf("arn:aws:s3:::%s/*", bucketName)},
			"Condition": map[string]any{"Bool": map[string]string{"aws:SecureTransport": "false"}},
		}},
	})
	if err != nil {
		return nil, err
	}
	_, err = s3.NewBucketPolicy(ctx, name+"-tls-only", &s3.BucketPolicyArgs{Bucket: bucket.ID(), Policy: pulumi.String(string(policy))}, pulumi.Parent(parent))
	if err != nil {
		return nil, err
	}
	return bucket, nil
}

func createS3PodRole(ctx *pulumi.Context, name string, clusterARN pulumi.StringInput, namespace, serviceAccount string, bucketARN pulumi.StringInput, tags pulumi.StringMap, parent pulumi.Resource) (*iam.Role, error) {
	trust := clusterARN.ToStringOutput().ApplyT(func(arn string) (string, error) {
		policy, err := json.Marshal(map[string]any{
			"Version": "2012-10-17", "Statement": []any{map[string]any{
				"Effect": "Allow", "Principal": map[string]string{"Service": "pods.eks.amazonaws.com"},
				"Action": []string{"sts:AssumeRole", "sts:TagSession"},
				"Condition": map[string]any{"StringEquals": map[string]string{
					"aws:RequestTag/eks-cluster-arn":            arn,
					"aws:RequestTag/kubernetes-namespace":       namespace,
					"aws:RequestTag/kubernetes-service-account": serviceAccount,
				}},
			}},
		})
		return string(policy), err
	}).(pulumi.StringOutput)
	role, err := iam.NewRole(ctx, name+"-role", &iam.RoleArgs{
		Name: pulumi.String(name), Description: pulumi.String("EKS Pod Identity role limited to one telemetry bucket"),
		AssumeRolePolicy: trust, Tags: tags,
	}, pulumi.Parent(parent))
	if err != nil {
		return nil, err
	}
	policy := bucketARN.ToStringOutput().ApplyT(func(arn string) (string, error) {
		policyDoc, err := json.Marshal(map[string]any{
			"Version": "2012-10-17", "Statement": []any{
				map[string]any{"Effect": "Allow", "Action": []string{"s3:ListBucket", "s3:ListBucketMultipartUploads", "s3:GetBucketLocation"}, "Resource": arn},
				map[string]any{"Effect": "Allow", "Action": []string{"s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"}, "Resource": arn + "/*"},
			},
		})
		return string(policyDoc), err
	}).(pulumi.StringOutput)
	managedPolicy, err := iam.NewPolicy(ctx, name+"-bucket-policy", &iam.PolicyArgs{
		Name: pulumi.String(name), Description: pulumi.String("Least-privilege S3 access to the assigned telemetry bucket"), Policy: policy,
	}, pulumi.Parent(parent))
	if err != nil {
		return nil, err
	}
	_, err = iam.NewRolePolicyAttachment(ctx, name+"-bucket-policy-attachment", &iam.RolePolicyAttachmentArgs{Role: role.Name, PolicyArn: managedPolicy.Arn}, pulumi.Parent(parent), pulumi.DependsOn([]pulumi.Resource{role, managedPolicy}))
	return role, err
}
