package config

import "fmt"

// Tags is a set of AWS resource tags.
type Tags map[string]string

// BuildTags returns standard ownership tags with additional caller tags.
// Additional tags cannot replace the standard ownership values.
func BuildTags(common Common, stack string, additional Tags) (Tags, error) {
	if err := common.Validate(); err != nil {
		return nil, err
	}
	if !validLabel(stack) {
		return nil, fmt.Errorf("stack %q must be a lowercase label containing letters, digits, and single hyphens", stack)
	}

	result := Tags{
		"Project":     common.Project,
		"Environment": common.Environment,
		"Region":      common.Region,
		"ManagedBy":   "pulumi",
		"Stack":       stack,
	}
	for key, value := range additional {
		if _, reserved := result[key]; reserved {
			return nil, fmt.Errorf("tag %q is reserved for standard ownership metadata", key)
		}
		if key == "" || len(key) > 128 {
			return nil, fmt.Errorf("tag key %q must contain between 1 and 128 bytes", key)
		}
		if len(value) > 256 {
			return nil, fmt.Errorf("tag %q value exceeds 256 bytes", key)
		}
		result[key] = value
	}
	return result, nil
}
