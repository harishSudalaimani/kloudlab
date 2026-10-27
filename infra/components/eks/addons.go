package eks

import (
	awsEks "github.com/pulumi/pulumi-aws/sdk/v7/go/aws/eks"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func createAddon(
	ctx *pulumi.Context,
	parent pulumi.Resource,
	name string,
	clusterName pulumi.StringInput,
	addonName string,
	tags pulumi.StringMapInput,
	dependencies []pulumi.Resource,
) (*awsEks.Addon, error) {
	return awsEks.NewAddon(ctx, name+"-addon-"+addonName, &awsEks.AddonArgs{
		ClusterName:              clusterName,
		AddonName:                pulumi.String(addonName),
		ResolveConflictsOnCreate: pulumi.StringPtr("OVERWRITE"),
		ResolveConflictsOnUpdate: pulumi.StringPtr("PRESERVE"),
		Tags:                     tags,
	}, pulumi.Parent(parent), pulumi.DependsOn(dependencies))
}
