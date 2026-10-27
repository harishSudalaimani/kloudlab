package eks

import (
	"fmt"
	"net/netip"
	"regexp"

	awsEks "github.com/pulumi/pulumi-aws/sdk/v7/go/aws/eks"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/vpc"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

var clusterNamePattern = regexp.MustCompile(`^[0-9A-Za-z][A-Za-z0-9_-]{0,99}$`)

// NewCluster creates one private-worker EKS cluster, its IAM roles, required
// managed add-ons, and baseline EC2 managed node group.
func NewCluster(ctx *pulumi.Context, name string, args *ClusterArgs, opts ...pulumi.ResourceOption) (*ClusterComponent, error) {
	if err := validateClusterArgs(name, args); err != nil {
		return nil, err
	}

	component := &ClusterComponent{}
	if err := ctx.RegisterComponentResource("kloudlab:eks:Cluster", name, component, opts...); err != nil {
		return nil, err
	}

	clusterRole, clusterRoleAttachments, err := createClusterRole(ctx, component, name, args.Tags)
	if err != nil {
		return nil, err
	}
	nodeRole, nodeRoleAttachments, err := createNodeRole(ctx, component, name, args.Tags)
	if err != nil {
		return nil, err
	}

	cluster, err := awsEks.NewCluster(ctx, name+"-control-plane", &awsEks.ClusterArgs{
		Name:                       pulumi.StringPtr(args.Name),
		Version:                    pulumi.StringPtr(args.KubernetesVersion),
		RoleArn:                    clusterRole.Arn,
		BootstrapSelfManagedAddons: pulumi.BoolPtr(false),
		DeletionProtection:         pulumi.BoolPtr(args.ProtectCluster),
		AccessConfig: &awsEks.ClusterAccessConfigArgs{
			AuthenticationMode:                      pulumi.String("API_AND_CONFIG_MAP"),
			BootstrapClusterCreatorAdminPermissions: pulumi.Bool(true),
		},
		VpcConfig: &awsEks.ClusterVpcConfigArgs{
			// EKS determines the VPC from the selected subnet IDs; vpc_id is
			// an output-only provider attribute and must not be configured.
			SubnetIds:             args.Network.PrivateSubnetIDs(),
			EndpointPrivateAccess: pulumi.BoolPtr(args.PrivateEndpointAccess),
			EndpointPublicAccess:  pulumi.BoolPtr(args.PublicEndpointAccess),
			PublicAccessCidrs:     stringArray(args.PublicAccessCIDRs),
		},
		Tags: args.Tags,
	}, append(append([]pulumi.ResourceOption{}, opts...), pulumi.Parent(component), pulumi.DependsOn(clusterRoleAttachments))...)
	if err != nil {
		return nil, err
	}

	clusterSecurityGroupID := cluster.VpcConfig.ClusterSecurityGroupId().ApplyT(func(id *string) (string, error) {
		if id == nil || *id == "" {
			return "", fmt.Errorf("EKS did not return the cluster security group ID")
		}
		return *id, nil
	}).(pulumi.StringOutput)

	dependencies := append([]pulumi.Resource{cluster}, nodeRoleAttachments...)
	if args.ManagementCIDR != nil {
		_, err := vpc.NewSecurityGroupIngressRule(ctx, name+"-management-api-ingress", &vpc.SecurityGroupIngressRuleArgs{
			SecurityGroupId: clusterSecurityGroupID,
			IpProtocol:      pulumi.String("tcp"),
			FromPort:        pulumi.Int(443),
			ToPort:          pulumi.Int(443),
			CidrIpv4:        args.ManagementCIDR,
			Description:     pulumi.String("Private Kubernetes API access from the management VPC"),
		}, append(append([]pulumi.ResourceOption{}, opts...), pulumi.Parent(component), pulumi.DependsOn([]pulumi.Resource{cluster}))...)
		if err != nil {
			return nil, err
		}
	}

	vpcCNI, err := createAddon(ctx, component, name, cluster.Name, "vpc-cni", args.Tags, append([]pulumi.Resource{cluster}, nodeRoleAttachments...))
	if err != nil {
		return nil, err
	}
	nodeGroup, err := createManagedNodeGroup(ctx, component, name, args, cluster, nodeRole, append(dependencies, vpcCNI))
	if err != nil {
		return nil, err
	}

	addonDependencies := []pulumi.Resource{cluster, nodeGroup}
	if _, err := createAddon(ctx, component, name, cluster.Name, "coredns", args.Tags, addonDependencies); err != nil {
		return nil, err
	}
	if args.EnableMetricsServer {
		if _, err := createAddon(ctx, component, name, cluster.Name, "metrics-server", args.Tags, addonDependencies); err != nil {
			return nil, err
		}
	}
	if _, err := createAddon(ctx, component, name, cluster.Name, "kube-proxy", args.Tags, addonDependencies); err != nil {
		return nil, err
	}
	var podIdentityAgent *awsEks.Addon
	if args.EnablePodIdentityAgent {
		podIdentityAgent, err = createAddon(ctx, component, name, cluster.Name, "eks-pod-identity-agent", args.Tags, addonDependencies)
		if err != nil {
			return nil, err
		}
	}
	if args.EnableEBSCSIDriver {
		if podIdentityAgent == nil {
			return nil, fmt.Errorf("EBS CSI requires the EKS Pod Identity Agent add-on")
		}
		ebsRole, ebsPolicy, err := createEBSCSIRole(ctx, component, name, args.Tags)
		if err != nil {
			return nil, err
		}
		if _, err := createEBSCSIDriverAddon(ctx, component, name, cluster.Name, ebsRole.Arn, args.Tags,
			[]pulumi.Resource{cluster, nodeGroup, podIdentityAgent, ebsPolicy}); err != nil {
			return nil, err
		}
	}

	component.clusterName = cluster.Name
	component.endpoint = cluster.Endpoint
	component.certificateAuthorityData = cluster.CertificateAuthority.Data().Elem()
	component.oidcIssuerURL = cluster.Identities.Index(pulumi.Int(0)).Oidcs().Index(pulumi.Int(0)).Issuer().ApplyT(func(issuer *string) (string, error) {
		if issuer == nil || *issuer == "" {
			return "", fmt.Errorf("EKS did not return an OIDC issuer URL")
		}
		return *issuer, nil
	}).(pulumi.StringOutput)
	component.clusterSecurityGroupID = clusterSecurityGroupID
	component.nodeRoleARN = nodeRole.Arn
	component.nodeGroupName = nodeGroup.NodeGroupName

	if err := ctx.RegisterResourceOutputs(component, pulumi.Map{
		"clusterName":              component.clusterName,
		"endpoint":                 component.endpoint,
		"certificateAuthorityData": component.certificateAuthorityData,
		"oidcIssuerUrl":            component.oidcIssuerURL,
		"clusterSecurityGroupId":   component.clusterSecurityGroupID,
		"nodeRoleArn":              component.nodeRoleARN,
		"nodeGroupName":            component.nodeGroupName,
	}); err != nil {
		return nil, err
	}
	return component, nil
}

func validateClusterArgs(name string, args *ClusterArgs) error {
	if name == "" || args == nil {
		return fmt.Errorf("EKS component name and arguments are required")
	}
	if !clusterNamePattern.MatchString(args.Name) {
		return fmt.Errorf("cluster name %q must be 1-100 characters and contain only letters, digits, hyphens, or underscores", args.Name)
	}
	if args.KubernetesVersion == "" {
		return fmt.Errorf("Kubernetes version is required")
	}
	if args.Network == nil {
		return fmt.Errorf("an EKS VPC and private subnets are required")
	}
	if !args.PrivateEndpointAccess {
		return fmt.Errorf("private Kubernetes API endpoint access must be enabled")
	}
	if args.PublicEndpointAccess && len(args.PublicAccessCIDRs) == 0 {
		return fmt.Errorf("public API endpoint access requires at least one restricted CIDR")
	}
	for _, cidr := range args.PublicAccessCIDRs {
		prefix, err := netip.ParsePrefix(cidr)
		if err != nil || !prefix.Addr().Is4() {
			return fmt.Errorf("public API access CIDR %q must be a valid IPv4 prefix", cidr)
		}
	}
	if len(args.InstanceTypes) == 0 {
		return fmt.Errorf("at least one managed node instance type is required")
	}
	if args.MinSize < 1 || args.DesiredSize < args.MinSize || args.MaxSize < args.DesiredSize {
		return fmt.Errorf("managed node scaling must satisfy 1 <= minSize <= desiredSize <= maxSize")
	}
	if args.DiskSizeGiB < 20 {
		return fmt.Errorf("managed node disk size must be at least 20 GiB")
	}
	return nil
}

func stringArray(values []string) pulumi.StringArray {
	result := make(pulumi.StringArray, 0, len(values))
	for _, value := range values {
		result = append(result, pulumi.String(value))
	}
	return result
}
