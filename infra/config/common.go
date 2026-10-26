// Package config holds shared, non-secret infrastructure configuration.
package config

import "fmt"

// DefaultAWSRegion is the initial target region. Stacks may override it.
const DefaultAWSRegion = "ap-south-1"

// Common contains values shared by infrastructure stacks.
type Common struct {
	Project     string
	Environment string
	Region      string
}

// Validate checks that shared labels are safe to use in resource names.
func (c Common) Validate() error {
	if !validLabel(c.Project) {
		return fmt.Errorf("project %q must be a lowercase label containing letters, digits, and single hyphens", c.Project)
	}
	if !validLabel(c.Environment) {
		return fmt.Errorf("environment %q must be a lowercase label containing letters, digits, and single hyphens", c.Environment)
	}
	if !validLabel(c.Region) {
		return fmt.Errorf("region %q must be a lowercase label containing letters, digits, and single hyphens", c.Region)
	}
	return nil
}
