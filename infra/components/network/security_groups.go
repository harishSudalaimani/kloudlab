package network

import (
	"fmt"
	"net/netip"

	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/ec2"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/vpc"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

// SecurityGroupRule describes one IPv4 ingress or egress rule. CIDRs are
// expanded to one AWS rule resource each, and must not be combined with a peer
// security group or Self.
type SecurityGroupRule struct {
	Protocol    string
	FromPort    int
	ToPort      int
	CIDRs       []string
	PeerGroupID pulumi.StringInput
	Self        bool
	Description string
}

// SecurityGroupArgs defines all allowed traffic. Empty rule lists create a
// group with no ingress and no egress; callers must opt into each flow.
type SecurityGroupArgs struct {
	VPCID   pulumi.StringInput
	Ingress []SecurityGroupRule
	Egress  []SecurityGroupRule
	Tags    map[string]string
}

// NewSecurityGroup creates a group and manages each rule as a separate AWS
// resource, avoiding inline-rule drift and AWS's default allow-all egress.
func NewSecurityGroup(
	ctx *pulumi.Context,
	name string,
	args *SecurityGroupArgs,
	opts ...pulumi.ResourceOption,
) (*ec2.SecurityGroup, error) {
	if name == "" || args == nil || args.VPCID == nil {
		return nil, fmt.Errorf("security group name, arguments, and VPC ID are required")
	}
	group, err := ec2.NewSecurityGroup(ctx, name, &ec2.SecurityGroupArgs{
		VpcId:       args.VPCID,
		Description: pulumi.String(name),
		Tags:        makeTags(args.Tags, name),
	}, opts...)
	if err != nil {
		return nil, err
	}
	if err := addSecurityGroupRules(ctx, name, group, args.Ingress, true, opts); err != nil {
		return nil, err
	}
	if err := addSecurityGroupRules(ctx, name, group, args.Egress, false, opts); err != nil {
		return nil, err
	}
	return group, nil
}

func addSecurityGroupRules(
	ctx *pulumi.Context,
	name string,
	group *ec2.SecurityGroup,
	rules []SecurityGroupRule,
	ingress bool,
	opts []pulumi.ResourceOption,
) error {
	direction := "egress"
	if ingress {
		direction = "ingress"
	}
	for ruleIndex, rule := range rules {
		if rule.Protocol != "tcp" && rule.Protocol != "udp" && rule.Protocol != "-1" {
			return fmt.Errorf("%s rule %d has unsupported protocol %q", direction, ruleIndex, rule.Protocol)
		}
		if rule.Protocol != "-1" && (rule.FromPort < 0 || rule.ToPort > 65535 || rule.FromPort > rule.ToPort) {
			return fmt.Errorf("%s rule %d has an invalid port range", direction, ruleIndex)
		}
		peers := 0
		if len(rule.CIDRs) > 0 {
			peers++
		}
		if rule.PeerGroupID != nil {
			peers++
		}
		if rule.Self {
			peers++
		}
		if peers != 1 {
			return fmt.Errorf("%s rule %d must specify exactly one CIDR, peer group, or self", direction, ruleIndex)
		}
		cidrs := make([]string, 0, len(rule.CIDRs))
		for _, cidr := range rule.CIDRs {
			prefix, err := netip.ParsePrefix(cidr)
			if err != nil || !prefix.Addr().Is4() {
				return fmt.Errorf("%s rule %d has invalid IPv4 CIDR %q", direction, ruleIndex, cidr)
			}
			cidrs = append(cidrs, prefix.Masked().String())
		}
		for cidrIndex := 0; cidrIndex < max(1, len(cidrs)); cidrIndex++ {
			var cidr string
			if len(cidrs) > 0 {
				cidr = cidrs[cidrIndex]
			}
			peerGroupID := rule.PeerGroupID
			if rule.Self {
				peerGroupID = group.ID().ToStringOutput()
			}
			resourceName := fmt.Sprintf("%s-%s-%d-%d", name, direction, ruleIndex+1, cidrIndex+1)
			resourceOptions := append(append([]pulumi.ResourceOption{}, opts...), pulumi.DependsOn([]pulumi.Resource{group}))
			if ingress {
				args := &vpc.SecurityGroupIngressRuleArgs{
					SecurityGroupId: group.ID().ToStringOutput(),
					IpProtocol:      pulumi.String(rule.Protocol),
				}
				if rule.Description != "" {
					args.Description = pulumi.String(rule.Description)
				}
				if cidr != "" {
					args.CidrIpv4 = pulumi.String(cidr)
				} else {
					args.ReferencedSecurityGroupId = peerGroupID
				}
				if rule.Protocol != "-1" {
					args.FromPort = pulumi.Int(rule.FromPort)
					args.ToPort = pulumi.Int(rule.ToPort)
				}
				if _, err := vpc.NewSecurityGroupIngressRule(ctx, resourceName, args, resourceOptions...); err != nil {
					return err
				}
			} else {
				args := &vpc.SecurityGroupEgressRuleArgs{
					SecurityGroupId: group.ID().ToStringOutput(),
					IpProtocol:      pulumi.String(rule.Protocol),
				}
				if rule.Description != "" {
					args.Description = pulumi.String(rule.Description)
				}
				if cidr != "" {
					args.CidrIpv4 = pulumi.String(cidr)
				} else {
					args.ReferencedSecurityGroupId = peerGroupID
				}
				if rule.Protocol != "-1" {
					args.FromPort = pulumi.Int(rule.FromPort)
					args.ToPort = pulumi.Int(rule.ToPort)
				}
				if _, err := vpc.NewSecurityGroupEgressRule(ctx, resourceName, args, resourceOptions...); err != nil {
					return err
				}
			}
		}
	}
	return nil
}
