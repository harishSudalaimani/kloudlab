# Gateway API standard CRDs

This chart vendors the Kubernetes SIG Network `standard-install.yaml` bundle
from Gateway API `v1.6.1` in `files/standard-install.yaml`. The Argo CD
Application keeps pruning and deletion disabled for these cluster-wide CRDs.

To update, download the desired release's `standard-install.yaml`, update
`appVersion`, render the chart, and review the CRD changes before merging.
