package eks

import (
	awsEks "github.com/pulumi/pulumi-aws/sdk/v7/go/aws/eks"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/iam"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func createManagedNodeGroup(
	ctx *pulumi.Context,
	parent pulumi.Resource,
	name string,
	args *ClusterArgs,
	cluster *awsEks.Cluster,
	nodeRole *iam.Role,
	dependencies []pulumi.Resource,
) (*awsEks.NodeGroup, error) {
	instanceTypes := make(pulumi.StringArray, 0, len(args.InstanceTypes))
	for _, instanceType := range args.InstanceTypes {
		instanceTypes = append(instanceTypes, pulumi.String(instanceType))
	}

	return awsEks.NewNodeGroup(ctx, name+"-baseline-node-group", &awsEks.NodeGroupArgs{
		ClusterName:   cluster.Name,
		NodeGroupName: pulumi.StringPtr(name + "-baseline"),
		NodeRoleArn:   nodeRole.Arn,
		SubnetIds:     args.Network.PrivateSubnetIDs(),
		InstanceTypes: instanceTypes,
		CapacityType:  pulumi.StringPtr("ON_DEMAND"),
		DiskSize:      pulumi.IntPtr(args.DiskSizeGiB),
		Version:       pulumi.StringPtr(args.KubernetesVersion),
		ScalingConfig: &awsEks.NodeGroupScalingConfigArgs{
			MinSize:     pulumi.Int(args.MinSize),
			DesiredSize: pulumi.Int(args.DesiredSize),
			MaxSize:     pulumi.Int(args.MaxSize),
		},
		Tags: args.Tags,
	}, pulumi.Parent(parent), pulumi.DependsOn(dependencies))
}
