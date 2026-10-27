package iam

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/iam"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

var githubRepositoryPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)
var gitBranchPattern = regexp.MustCompile(`^[A-Za-z0-9._/-]+$`)
var iamRoleNamePattern = regexp.MustCompile(`^[A-Za-z0-9_+=,.@-]{1,64}$`)

// GitHubActionsRoleArgs configures a branch-restricted GitHub Actions trust
// and its explicitly supplied permissions policy.
type GitHubActionsRoleArgs struct {
	RoleName           string
	Repository         string
	Branches           []string
	PermissionsPolicy  string
	Tags               map[string]string
}

// GitHubActionsRole exports the provider and role identifiers.
type GitHubActionsRole struct {
	pulumi.ResourceState
	providerARN pulumi.StringOutput
	roleARN     pulumi.StringOutput
}

func (r *GitHubActionsRole) ProviderARN() pulumi.StringOutput { return r.providerARN }
func (r *GitHubActionsRole) RoleARN() pulumi.StringOutput     { return r.roleARN }

// NewGitHubActionsRole creates GitHub's OIDC provider and a role that can be
// assumed only by exact refs/heads subjects in the configured repository.
// Permission grants are supplied as reviewed JSON and attached as a separate
// IAM policy to keep trust and permissions independently visible.
func NewGitHubActionsRole(ctx *pulumi.Context, name string, args *GitHubActionsRoleArgs, opts ...pulumi.ResourceOption) (*GitHubActionsRole, error) {
	if args == nil || name == "" || args.RoleName == "" {
		return nil, fmt.Errorf("component name, arguments, and role name are required")
	}
	if !iamRoleNamePattern.MatchString(args.RoleName) {
		return nil, fmt.Errorf("IAM role name contains unsupported characters or exceeds 64 characters")
	}
	if !githubRepositoryPattern.MatchString(args.Repository) {
		return nil, fmt.Errorf("GitHub repository must use owner/repository format")
	}
	if len(args.Branches) == 0 {
		return nil, fmt.Errorf("at least one exact GitHub branch is required")
	}
	if !json.Valid([]byte(args.PermissionsPolicy)) {
		return nil, fmt.Errorf("permissions policy must be valid JSON")
	}
	var policyDocument struct {
		Version   string          `json:"Version"`
		Statement json.RawMessage `json:"Statement"`
	}
	if err := json.Unmarshal([]byte(args.PermissionsPolicy), &policyDocument); err != nil || policyDocument.Version == "" || len(policyDocument.Statement) == 0 {
		return nil, fmt.Errorf("permissions policy must include Version and Statement fields")
	}
	branchSubjects := make([]string, 0, len(args.Branches))
	seen := make(map[string]struct{}, len(args.Branches))
	for _, branch := range args.Branches {
		if branch == "" || strings.HasPrefix(branch, "/") || strings.HasSuffix(branch, "/") || strings.Contains(branch, "..") || strings.Contains(branch, "//") || !gitBranchPattern.MatchString(branch) {
			return nil, fmt.Errorf("branch %q is not a valid exact GitHub branch name", branch)
		}
		if _, exists := seen[branch]; exists {
			return nil, fmt.Errorf("branch %q is repeated", branch)
		}
		seen[branch] = struct{}{}
		branchSubjects = append(branchSubjects, "repo:"+args.Repository+":ref:refs/heads/"+branch)
	}

	component := &GitHubActionsRole{}
	if err := ctx.RegisterComponentResource("kloudlab:iam:GitHubActionsRole", name, component, opts...); err != nil {
		return nil, err
	}
	provider, err := iam.NewOpenIdConnectProvider(ctx, name+"-github-oidc", &iam.OpenIdConnectProviderArgs{
		Url: pulumi.String("https://token.actions.githubusercontent.com"),
		ClientIdLists: pulumi.StringArray{
			pulumi.String("sts.amazonaws.com"),
		},
	}, pulumi.Parent(component), pulumi.Protect(true))
	if err != nil {
		return nil, err
	}
	trustPolicy := provider.Arn.ApplyT(func(providerARN string) string {
		policy, _ := json.Marshal(map[string]interface{}{
			"Version": "2012-10-17",
			"Statement": []map[string]interface{}{{
				"Effect": "Allow",
				"Principal": map[string]string{
					"Federated": providerARN,
				},
				"Action": "sts:AssumeRoleWithWebIdentity",
				"Condition": map[string]interface{}{
					"StringEquals": map[string]interface{}{
						"token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
						"token.actions.githubusercontent.com:sub": branchSubjects,
					},
				},
			}},
		})
		return string(policy)
	}).(pulumi.StringOutput)
	role, err := iam.NewRole(ctx, name+"-role", &iam.RoleArgs{
		Name:             pulumi.String(args.RoleName),
		AssumeRolePolicy: trustPolicy,
		Tags:             toStringMap(args.Tags),
	}, pulumi.Parent(component), pulumi.Protect(true))
	if err != nil {
		return nil, err
	}
	policy, err := iam.NewPolicy(ctx, name+"-permissions", &iam.PolicyArgs{
		Name:        pulumi.String(args.RoleName+"-permissions"),
		Description: pulumi.String("Reviewed deployment permissions for KloudLab network stacks"),
		Policy:      pulumi.String(args.PermissionsPolicy),
		Tags:        toStringMap(args.Tags),
	}, pulumi.Parent(component), pulumi.Protect(true))
	if err != nil {
		return nil, err
	}
	if _, err := iam.NewRolePolicyAttachment(ctx, name+"-permissions-attachment", &iam.RolePolicyAttachmentArgs{
		Role:      role.Name,
		PolicyArn: policy.Arn,
	}, pulumi.Parent(component), pulumi.DependsOn([]pulumi.Resource{role, policy})); err != nil {
		return nil, err
	}

	component.providerARN = provider.Arn
	component.roleARN = role.Arn
	if err := ctx.RegisterResourceOutputs(component, pulumi.Map{
		"providerArn": component.providerARN,
		"roleArn":     component.roleARN,
	}); err != nil {
		return nil, err
	}
	return component, nil
}

func toStringMap(values map[string]string) pulumi.StringMap {
	result := make(pulumi.StringMap, len(values))
	for key, value := range values {
		result[key] = pulumi.String(value)
	}
	return result
}
