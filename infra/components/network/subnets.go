package network

import (
	"encoding/binary"
	"fmt"
	"net/netip"

	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/ec2"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

type subnetSet struct {
	public  []*ec2.Subnet
	private []*ec2.Subnet
}

func createSubnets(ctx *pulumi.Context, parent *VPC, vpc *ec2.Vpc, name string, args *Args) (*subnetSet, error) {
	cidrs, err := splitCIDRs(args.CIDRBlock, args.SubnetPrefixLength, 2*len(args.AvailabilityZones))
	if err != nil {
		return nil, err
	}

	result := &subnetSet{
		public:  make([]*ec2.Subnet, 0, len(args.AvailabilityZones)),
		private: make([]*ec2.Subnet, 0, len(args.AvailabilityZones)),
	}
	zoneCount := len(args.AvailabilityZones)
	for index, zone := range args.AvailabilityZones {
		publicSubnet, err := ec2.NewSubnet(ctx, fmt.Sprintf("%s-public-%d", name, index+1), &ec2.SubnetArgs{
			VpcId:               vpc.ID(),
			CidrBlock:           pulumi.String(cidrs[index]),
			AvailabilityZone:    pulumi.String(zone),
			MapPublicIpOnLaunch: pulumi.Bool(false),
			Tags:                makeSubnetTags(args.Tags, fmt.Sprintf("%s-public-%d", name, index+1), "kubernetes.io/role/elb"),
		}, pulumi.Parent(parent))
		if err != nil {
			return nil, err
		}
		result.public = append(result.public, publicSubnet)

		privateSubnet, err := ec2.NewSubnet(ctx, fmt.Sprintf("%s-private-%d", name, index+1), &ec2.SubnetArgs{
			VpcId:               vpc.ID(),
			CidrBlock:           pulumi.String(cidrs[zoneCount+index]),
			AvailabilityZone:    pulumi.String(zone),
			MapPublicIpOnLaunch: pulumi.Bool(false),
			Tags:                makeSubnetTags(args.Tags, fmt.Sprintf("%s-private-%d", name, index+1), "kubernetes.io/role/internal-elb", "kubernetes.io/role/cni"),
		}, pulumi.Parent(parent))
		if err != nil {
			return nil, err
		}
		result.private = append(result.private, privateSubnet)
	}
	return result, nil
}

func makeSubnetTags(base map[string]string, name string, roleTags ...string) pulumi.StringMap {
	tags := makeTags(base, name)
	for _, tag := range roleTags {
		tags[tag] = pulumi.String("1")
	}
	return tags
}

func splitCIDRs(cidr string, subnetPrefixLength, count int) ([]string, error) {
	vpcPrefix, err := netip.ParsePrefix(cidr)
	if err != nil || !vpcPrefix.Addr().Is4() {
		return nil, fmt.Errorf("VPC CIDR %q must be a valid IPv4 prefix", cidr)
	}
	vpcPrefix = vpcPrefix.Masked()
	if subnetPrefixLength <= vpcPrefix.Bits() || subnetPrefixLength > 28 {
		return nil, fmt.Errorf("subnet prefix /%d must be longer than the VPC prefix and no longer than /28", subnetPrefixLength)
	}
	capacity := 1 << uint(subnetPrefixLength-vpcPrefix.Bits())
	if count > capacity {
		return nil, fmt.Errorf("VPC CIDR %q has room for %d /%d subnets, but %d are required", cidr, capacity, subnetPrefixLength, count)
	}

	addressBytes := vpcPrefix.Addr().As4()
	base := binary.BigEndian.Uint32(addressBytes[:])
	blockSize := uint32(1) << uint(32-subnetPrefixLength)
	result := make([]string, 0, count)
	for index := 0; index < count; index++ {
		address := [4]byte{}
		binary.BigEndian.PutUint32(address[:], base+uint32(index)*blockSize)
		result = append(result, netip.PrefixFrom(netip.AddrFrom4(address), subnetPrefixLength).String())
	}
	return result, nil
}
