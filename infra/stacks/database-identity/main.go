package main

import (
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	pulumiconfig "github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"

	"github.com/harishsudalaimani/kloudlab/infra/components/database"
	kloudconfig "github.com/harishsudalaimani/kloudlab/infra/config"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		stackConfig := pulumiconfig.New(ctx, "kloudlab-database")
		awsConfig := pulumiconfig.New(ctx, "aws")
		environment := stackConfig.Require("environment")
		region := awsConfig.Require("region")
		networkStack, clusterStack := stackConfig.Require("networkStack"), stackConfig.Require("clusterStack")
		password := stackConfig.RequireSecret("masterPassword")

		networkRef, err := pulumi.NewStackReference(ctx, "identity-network-reference", &pulumi.StackReferenceArgs{Name: pulumi.String(networkStack)})
		if err != nil {
			return err
		}
		clusterRef, err := pulumi.NewStackReference(ctx, "identity-cluster-reference", &pulumi.StackReferenceArgs{Name: pulumi.String(clusterStack)})
		if err != nil {
			return err
		}

		common := kloudconfig.Common{Project: "kloudlab", Environment: environment, Region: region}
		if err := common.Validate(); err != nil {
			return err
		}
		tags, err := kloudconfig.BuildTags(common, "database-identity", nil)
		if err != nil {
			return err
		}
		pulumiTags := make(pulumi.StringMap, len(tags))
		for key, value := range tags {
			pulumiTags[key] = pulumi.String(value)
		}

		instance, err := database.NewPostgreSQLStack(ctx, "kloudlab-identity-postgres", &database.PostgreSQLStackArgs{
			VPCID:                   networkRef.GetStringOutput(pulumi.String("vpcId")),
			PrivateSubnetIDs:        networkRef.GetOutput(pulumi.String("privateSubnetIds")).AsStringArrayOutput(),
			EKSClusterSecurityGroup: clusterRef.GetStringOutput(pulumi.String("clusterSecurityGroupId")),
			MasterUsername:          stackConfig.Require("masterUsername"),
			MasterPassword:          password.ToStringOutput(),
			DatabaseName:            stackConfig.Require("databaseName"),
			EngineVersion:           stackConfig.Require("engineVersion"),
			InstanceClass:           stackConfig.Require("instanceClass"),
			AllocatedStorageGiB:     stackConfig.RequireInt("allocatedStorageGiB"),
			BackupRetentionDays:     stackConfig.RequireInt("backupRetentionDays"),
			MultiAZ:                 stackConfig.GetBool("multiAZ"),
			DeletionProtection:      stackConfig.GetBool("deletionProtection"),
			Tags:                    pulumiTags,
		})
		if err != nil {
			return err
		}
		ctx.Export("databaseAddress", instance.Address())
		ctx.Export("databasePort", instance.Port())
		ctx.Export("databaseName", instance.DatabaseName())
		ctx.Export("databaseSecurityGroupId", instance.SecurityGroupID())
		ctx.Export("databaseInstanceId", instance.InstanceID())
		return nil
	})
}
