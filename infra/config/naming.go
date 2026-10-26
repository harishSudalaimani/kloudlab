package config

import (
	"fmt"
	"strings"
)

// ResourcePrefix returns a stable project-environment-workload prefix.
func ResourcePrefix(project, environment, workload string) (string, error) {
	labels := []struct {
		name  string
		value string
	}{
		{name: "project", value: project},
		{name: "environment", value: environment},
		{name: "workload", value: workload},
	}
	for _, label := range labels {
		if !validLabel(label.value) {
			return "", fmt.Errorf("%s %q must be a lowercase label containing letters, digits, and single hyphens", label.name, label.value)
		}
	}
	return strings.Join([]string{project, environment, workload}, "-"), nil
}
