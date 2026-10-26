package config

import (
	"fmt"
	"net/netip"
	"regexp"
)

var labelPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

func validLabel(value string) bool {
	return labelPattern.MatchString(value)
}

// ValidateNonOverlappingCIDRs checks that every range is a valid IPv4 CIDR and
// that no range overlaps another. Callers should include connected networks.
func ValidateNonOverlappingCIDRs(cidrs []string) error {
	prefixes := make([]netip.Prefix, 0, len(cidrs))
	for _, cidr := range cidrs {
		prefix, err := netip.ParsePrefix(cidr)
		if err != nil || !prefix.Addr().Is4() {
			return fmt.Errorf("CIDR %q must be a valid IPv4 prefix", cidr)
		}
		if prefix != prefix.Masked() {
			return fmt.Errorf("CIDR %q must use its canonical network address", cidr)
		}
		prefix = prefix.Masked()
		for index, previous := range prefixes {
			if prefix.Overlaps(previous) {
				return fmt.Errorf("CIDRs %q and %q overlap", cidrs[index], cidr)
			}
		}
		prefixes = append(prefixes, prefix)
	}
	return nil
}
