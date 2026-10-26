// Package backend provisions the S3 and KMS resources used by Pulumi's DIY
// backend. Bootstrap this component from a protected local state directory,
// then migrate the stack to its S3 backend before creating other stacks.
package backend

import (
	"fmt"
	"regexp"

	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/kms"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/s3"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

var bucketNamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$`)

// StateBackendArgs describes the remote state bucket and its encryption key.
type StateBackendArgs struct {
	BucketName string
	Tags       map[string]string
}

// StateBackend exposes only non-secret identifiers for remote backend setup.
type StateBackend struct {
	pulumi.ResourceState

	bucketName pulumi.StringOutput
	bucketARN  pulumi.StringOutput
	kmsKeyARN  pulumi.StringOutput
}

// BucketName returns the state bucket name.
func (s *StateBackend) BucketName() pulumi.StringOutput { return s.bucketName }

// BucketARN returns the state bucket ARN.
func (s *StateBackend) BucketARN() pulumi.StringOutput { return s.bucketARN }

// KMSKeyARN returns the key ARN used for S3 and Pulumi secrets encryption.
func (s *StateBackend) KMSKeyARN() pulumi.StringOutput { return s.kmsKeyARN }

// NewStateBackend creates a versioned, private, TLS-only S3 bucket with
// customer-managed KMS encryption. The resources are protected from deletion.
func NewStateBackend(ctx *pulumi.Context, name string, args *StateBackendArgs, opts ...pulumi.ResourceOption) (*StateBackend, error) {
	if args == nil || !bucketNamePattern.MatchString(args.BucketName) {
		return nil, fmt.Errorf("state bucket name must be a valid globally unique S3 bucket name")
	}

	component := &StateBackend{}
	if err := ctx.RegisterComponentResource("kloudlab:bootstrap:StateBackend", name, component, opts...); err != nil {
		return nil, err
	}
	key, err := kms.NewKey(ctx, name+"-kms-key", &kms.KeyArgs{
		Description:          pulumi.String("Encrypt KloudLab Pulumi state and stack secrets"),
		EnableKeyRotation:    pulumi.Bool(true),
		DeletionWindowInDays: pulumi.Int(30),
		Tags:                 resourceTags(args.Tags, name+"-kms-key"),
	}, pulumi.Parent(component), pulumi.Protect(true))
	if err != nil {
		return nil, err
	}
	_, err = kms.NewAlias(ctx, name+"-kms-alias", &kms.AliasArgs{
		Name:        pulumi.String("alias/kloudlab-pulumi-state"),
		TargetKeyId: key.KeyId,
	}, pulumi.Parent(component), pulumi.Protect(true))
	if err != nil {
		return nil, err
	}

	bucket, err := s3.NewBucket(ctx, name+"-bucket", &s3.BucketArgs{
		Bucket: pulumi.String(args.BucketName),
		Tags:   resourceTags(args.Tags, name+"-bucket"),
	}, pulumi.Parent(component), pulumi.Protect(true))
	if err != nil {
		return nil, err
	}
	_, err = s3.NewBucketPublicAccessBlock(ctx, name+"-public-access", &s3.BucketPublicAccessBlockArgs{
		Bucket:                bucket.ID().ToStringOutput(),
		BlockPublicAcls:       pulumi.Bool(true),
		BlockPublicPolicy:     pulumi.Bool(true),
		IgnorePublicAcls:      pulumi.Bool(true),
		RestrictPublicBuckets: pulumi.Bool(true),
	}, pulumi.Parent(component))
	if err != nil {
		return nil, err
	}
	_, err = s3.NewBucketVersioning(ctx, name+"-versioning", &s3.BucketVersioningArgs{
		Bucket: bucket.ID().ToStringOutput(),
		VersioningConfiguration: &s3.BucketVersioningVersioningConfigurationArgs{
			Status: pulumi.String("Enabled"),
		},
	}, pulumi.Parent(component))
	if err != nil {
		return nil, err
	}
	_, err = s3.NewBucketServerSideEncryptionConfiguration(ctx, name+"-encryption", &s3.BucketServerSideEncryptionConfigurationArgs{
		Bucket: bucket.ID().ToStringOutput(),
		Rules: s3.BucketServerSideEncryptionConfigurationRuleArray{
			&s3.BucketServerSideEncryptionConfigurationRuleArgs{
				ApplyServerSideEncryptionByDefault: &s3.BucketServerSideEncryptionConfigurationRuleApplyServerSideEncryptionByDefaultArgs{
					KmsMasterKeyId: key.Arn,
					SseAlgorithm:   pulumi.String("aws:kms"),
				},
			},
		},
	}, pulumi.Parent(component))
	if err != nil {
		return nil, err
	}
	_, err = s3.NewBucketPolicy(ctx, name+"-tls-policy", &s3.BucketPolicyArgs{
		Bucket: bucket.ID().ToStringOutput(),
		Policy: pulumi.Sprintf(`{"Version":"2012-10-17","Statement":[{"Effect":"Deny","Principal":"*","Action":"s3:*","Resource":["%s","%s/*"],"Condition":{"Bool":{"aws:SecureTransport":"false"}}}]}`, bucket.Arn, bucket.Arn),
	}, pulumi.Parent(component))
	if err != nil {
		return nil, err
	}

	component.bucketName = bucket.Bucket
	component.bucketARN = bucket.Arn
	component.kmsKeyARN = key.Arn
	component.RegisterOutputs(pulumi.Map{
		"bucketName": component.bucketName,
		"bucketArn":  component.bucketARN,
		"kmsKeyArn":  component.kmsKeyARN,
	})
	return component, nil
}

func resourceTags(base map[string]string, name string) pulumi.StringMap {
	tags := make(pulumi.StringMap, len(base)+1)
	for key, value := range base {
		tags[key] = pulumi.String(value)
	}
	tags["Name"] = pulumi.String(name)
	return tags
}
