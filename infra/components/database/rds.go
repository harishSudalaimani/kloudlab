// Package database provisions private PostgreSQL services for KloudLab.
package database

import (
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/ec2"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/rds"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

// PostgreSQLStackArgs contains network coordinates and database settings. The
// master password is a Pulumi secret input and is never exported by this
// component.
type PostgreSQLStackArgs struct {
	VPCID                   pulumi.StringInput
	PrivateSubnetIDs        pulumi.StringArrayInput
	EKSClusterSecurityGroup pulumi.StringInput
	MasterUsername          string
	MasterPassword          pulumi.StringInput
	DatabaseName            string
	EngineVersion           string
	InstanceClass           string
	AllocatedStorageGiB     int
	BackupRetentionDays     int
	MultiAZ                 bool
	DeletionProtection      bool
	Tags                    pulumi.StringMap
}

// PostgreSQLStack exposes non-secret connection coordinates for private RDS.
type PostgreSQLStack struct {
	pulumi.ResourceState
	address       pulumi.StringOutput
	port          pulumi.IntOutput
	databaseName  pulumi.StringOutput
	securityGroup pulumi.StringOutput
	instanceID    pulumi.StringOutput
}

func (s *PostgreSQLStack) Address() pulumi.StringOutput         { return s.address }
func (s *PostgreSQLStack) Port() pulumi.IntOutput               { return s.port }
func (s *PostgreSQLStack) DatabaseName() pulumi.StringOutput    { return s.databaseName }
func (s *PostgreSQLStack) SecurityGroupID() pulumi.StringOutput { return s.securityGroup }
func (s *PostgreSQLStack) InstanceID() pulumi.StringOutput      { return s.instanceID }

// NewPostgreSQLStack creates one encrypted PostgreSQL RDS instance in private
// subnets. Only the identity EKS cluster security group can reach TCP/5432.
func NewPostgreSQLStack(ctx *pulumi.Context, name string, args *PostgreSQLStackArgs, opts ...pulumi.ResourceOption) (*PostgreSQLStack, error) {
	if name == "" || args == nil || args.VPCID == nil || args.PrivateSubnetIDs == nil || args.EKSClusterSecurityGroup == nil || args.MasterPassword == nil {
		return nil, fmt.Errorf("database name, VPC, private subnets, EKS security group and secret master password are required")
	}
	if args.MasterUsername == "" || args.DatabaseName == "" || args.EngineVersion == "" || args.InstanceClass == "" {
		return nil, fmt.Errorf("database username, database name, engine version and instance class are required")
	}
	if args.AllocatedStorageGiB < 20 || args.BackupRetentionDays < 1 || args.BackupRetentionDays > 35 {
		return nil, fmt.Errorf("database storage must be at least 20 GiB and backup retention must be 1-35 days")
	}

	component := &PostgreSQLStack{}
	if err := ctx.RegisterComponentResource("kloudlab:database:PostgreSQL", name, component, opts...); err != nil {
		return nil, err
	}

	tags := args.Tags
	if tags == nil {
		tags = pulumi.StringMap{}
	}

	subnets, err := rds.NewSubnetGroup(ctx, name+"-subnets", &rds.SubnetGroupArgs{
		Name:        pulumi.String(name),
		SubnetIds:   args.PrivateSubnetIDs,
		Description: pulumi.String("Private identity database subnets"),
		Tags:        tags,
	}, pulumi.Parent(component))
	if err != nil {
		return nil, err
	}

	securityGroup, err := ec2.NewSecurityGroup(ctx, name+"-security-group", &ec2.SecurityGroupArgs{
		Name:        pulumi.StringPtr(name),
		Description: pulumi.StringPtr("PostgreSQL ingress from KloudLab identity EKS only"),
		VpcId:       args.VPCID.ToStringOutput().ToStringPtrOutput(),
		Ingress: ec2.SecurityGroupIngressArray{
			&ec2.SecurityGroupIngressArgs{
				Protocol: pulumi.String("tcp"), FromPort: pulumi.Int(5432), ToPort: pulumi.Int(5432),
				SecurityGroups: pulumi.StringArray{args.EKSClusterSecurityGroup.ToStringOutput()},
				Description:    pulumi.StringPtr("PostgreSQL from the identity EKS cluster only"),
			},
		},
		// An explicitly empty list removes the AWS default allow-all egress rule.
		Egress: ec2.SecurityGroupEgressArray{},
		Tags:   tags,
	}, pulumi.Parent(component))
	if err != nil {
		return nil, err
	}

	instance, err := rds.NewInstance(ctx, name+"-instance", &rds.InstanceArgs{
		Identifier:              pulumi.String(name),
		Engine:                  pulumi.StringPtr("postgres"),
		EngineVersion:           pulumi.StringPtr(args.EngineVersion),
		InstanceClass:           pulumi.String(args.InstanceClass),
		DbName:                  pulumi.StringPtr(args.DatabaseName),
		Username:                pulumi.StringPtr(args.MasterUsername),
		Password:                args.MasterPassword.ToStringOutput().ToStringPtrOutput(),
		Port:                    pulumi.IntPtr(5432),
		AllocatedStorage:        pulumi.IntPtr(args.AllocatedStorageGiB),
		StorageType:             pulumi.StringPtr("gp3"),
		StorageEncrypted:        pulumi.BoolPtr(true),
		BackupRetentionPeriod:   pulumi.IntPtr(args.BackupRetentionDays),
		CopyTagsToSnapshot:      pulumi.BoolPtr(true),
		MultiAz:                 pulumi.BoolPtr(args.MultiAZ),
		PubliclyAccessible:      pulumi.BoolPtr(false),
		AutoMinorVersionUpgrade: pulumi.BoolPtr(true),
		DeletionProtection:      pulumi.BoolPtr(args.DeletionProtection),
		SkipFinalSnapshot:       pulumi.BoolPtr(false),
		FinalSnapshotIdentifier: pulumi.StringPtr(name + "-final-snapshot"),
		DbSubnetGroupName:       subnets.Name.ToStringPtrOutput(),
		VpcSecurityGroupIds:     pulumi.StringArray{securityGroup.ID()},
		Tags:                    tags,
	}, pulumi.Parent(component), pulumi.DependsOn([]pulumi.Resource{subnets, securityGroup}))
	if err != nil {
		return nil, err
	}

	component.address = instance.Address
	component.port = instance.Port
	component.databaseName = pulumi.String(args.DatabaseName).ToStringOutput()
	component.securityGroup = securityGroup.ID().ToStringOutput()
	component.instanceID = instance.ID().ToStringOutput()
	if err := ctx.RegisterResourceOutputs(component, pulumi.Map{
		"address":       component.address,
		"port":          component.port,
		"databaseName":  component.databaseName,
		"securityGroup": component.securityGroup,
		"instanceId":    component.instanceID,
	}); err != nil {
		return nil, err
	}
	return component, nil
}
