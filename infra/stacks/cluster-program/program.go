package clusterprogram

import (
	"fmt"

	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	pulumiconfig "github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"

	"github.com/harishsudalaimani/kloudlab/infra/components/eks"
	"github.com/harishsudalaimani/kloudlab/infra/config"
)

type stackNetwork struct {
	vpcID            pulumi.StringOutput
	privateSubnetIDs pulumi.StringArrayOutput
}

func (n stackNetwork) VPCID() pulumi.StringOutput {
	return n.vpcID
}

func (n stackNetwork) PrivateSubnetIDs() pulumi.StringArrayOutput {
	return n.privateSubnetIDs
}

// Run creates one EKS cluster and its baseline managed node group from the
// network outputs exported by the corresponding VPC stack.
func Run(ctx *pulumi.Context, workload string) error {
	stackConfig := pulumiconfig.New(ctx, "kloudlab-cluster")
	awsConfig := pulumiconfig.New(ctx, "aws")
	environment := stackConfig.Require("environment")
	region := awsConfig.Require("region")
	common := config.Common{
		Project:     "kloudlab",
		Environment: environment,
		Region:      region,
	}
	if err := common.Validate(); err != nil {
		return err
	}

	networkStackName := stackConfig.Require("networkStack")
	networkReference, err := pulumi.NewStackReference(ctx, workload+"-network-reference", &pulumi.StackReferenceArgs{
		Name: pulumi.String(networkStackName),
	})
	if err != nil {
		return err
	}
	networkOutputs := stackNetwork{
		vpcID:            networkReference.GetStringOutput(pulumi.String("vpcId")),
		privateSubnetIDs: networkReference.GetOutput(pulumi.String("privateSubnetIds")).AsStringArrayOutput(),
	}

	var managementCIDR pulumi.StringInput
	managementStackName := stackConfig.Require("managementNetworkStack")
	if workload != "management" {
		managementReference, err := pulumi.NewStackReference(ctx, "management-network-reference", &pulumi.StackReferenceArgs{
			Name: pulumi.String(managementStackName),
		})
		if err != nil {
			return err
		}
		managementCIDR = managementReference.GetStringOutput(pulumi.String("cidrBlock"))
	}

	publicAccessCIDRs := []string{}
	if err := stackConfig.GetObject("publicAccessCidrs", &publicAccessCIDRs); err != nil {
		return err
	}
	instanceTypes := []string{}
	if err := stackConfig.GetObject("instanceTypes", &instanceTypes); err != nil {
		return err
	}
	tags, err := config.BuildTags(common, "eks-"+workload, nil)
	if err != nil {
		return err
	}
	pulumiTags := make(pulumi.StringMap, len(tags))
	for key, value := range tags {
		pulumiTags[key] = pulumi.String(value)
	}

	componentName, err := config.ResourcePrefix("kloudlab", environment, "eks-"+workload)
	if err != nil {
		return err
	}
	clusterName := stackConfig.Require("clusterName")
	if clusterName == "" {
		return fmt.Errorf("clusterName is required")
	}
	cluster, err := eks.NewCluster(ctx, componentName, &eks.ClusterArgs{
		Name:                   clusterName,
		KubernetesVersion:      stackConfig.Require("kubernetesVersion"),
		Network:                networkOutputs,
		PublicEndpointAccess:   stackConfig.GetBool("publicEndpointAccess"),
		PrivateEndpointAccess:  stackConfig.GetBool("privateEndpointAccess"),
		PublicAccessCIDRs:      publicAccessCIDRs,
		ManagementCIDR:         managementCIDR,
		InstanceTypes:          instanceTypes,
		MinSize:                stackConfig.RequireInt("minSize"),
		DesiredSize:            stackConfig.RequireInt("desiredSize"),
		MaxSize:                stackConfig.RequireInt("maxSize"),
		DiskSizeGiB:            stackConfig.RequireInt("diskSizeGiB"),
		ManageKubeProxy:        stackConfig.GetBool("manageKubeProxy"),
		HoldNodesForCilium:     stackConfig.GetBool("holdNodesForCilium"),
		EnablePodIdentityAgent: stackConfig.GetBool("enablePodIdentityAgent"),
		EnableEBSCSIDriver:     stackConfig.GetBool("enableEBSCSIDriver"),
		ProtectCluster:         stackConfig.GetBool("protectCluster"),
		Tags:                   pulumiTags,
	})
	if err != nil {
		return err
	}

	ctx.Export("clusterName", cluster.ClusterName())
	ctx.Export("clusterEndpoint", cluster.Endpoint())
	ctx.Export("oidcIssuerUrl", cluster.OIDCIssuerURL())
	ctx.Export("clusterSecurityGroupId", cluster.ClusterSecurityGroupID())
	ctx.Export("nodeRoleArn", cluster.NodeRoleARN())
	ctx.Export("nodeGroupName", cluster.NodeGroupName())
	ctx.Export("vpcId", networkOutputs.VPCID())
	ctx.Export("privateSubnetIds", networkOutputs.PrivateSubnetIDs())
	return nil
}
