# Argo CD rollout, one cluster at a time

Argo CD runs in `kloudlab-management`. That cluster is the GitOps control plane
and the first cluster Argo manages. There is no separate bootstrap cluster and
no need for a `kloudlab-bootstrap` AppProject.

There is one small first-use step: Argo CD's built-in `default` project creates
the four KloudLab AppProjects from Git. After that, root Applications use
`kloudlab-management`; each cluster's child Applications use that cluster's
own AppProject. The seed Application lives in the management cluster and is
defined in `gitops/management/bootstrap/projects-application.yaml`.

## 1. Create the four AppProjects

In the Argo CD UI, create the seed Application from the manifest above (or
enter these values in **New App**):

| Field | Value |
| --- | --- |
| Application Name | `kloudlab-management-projects` |
| Project Name | `default` |
| Sync Policy | Automated |
| Repository URL | `https://github.com/harishSudalaimani/kloudlab.git` |
| Revision | `main` |
| Path | `gitops/management/projects` |
| Directory recurse | Off |
| Cluster URL/name | `in-cluster` |
| Namespace | `argocd` |
| Self-heal | On |
| Prune | Off |

Wait for it to become **Synced** and **Healthy**. In **Settings → Projects**,
confirm these four projects exist:

- `kloudlab-management`
- `kloudlab-identity`
- `kloudlab-app`
- `kloudlab-observability`

## 2. Manage the management cluster

The management root Applications use the `kloudlab-management` project. The
Cilium root is defined in `gitops/management/roots/management.yaml`; it syncs
automatically. The Gateway API/kgateway root is
`gitops/management/roots/management-gateway.yaml` and stays manual until Cilium
is healthy. The kgateway child Applications retain their sync waves for CRD,
controller, and Gateway ordering. Both roots create child Applications in the
local Argo CD cluster (`in-cluster`); the child Applications declare their
actual workload destinations.

Keep EKS kube-proxy until management-cluster Cilium is healthy. Review each
root's diff before syncing it.

## 3. Add workload clusters in order

`kloudlab-root` manages the three workload-cluster root Application
declarations from `gitops/management/staged-roots/`. Those root Applications
use manual sync, so they can be visible in Argo CD without deploying all
workload clusters at once. Sync only the next root after the previous cluster
is healthy:

1. `identity.yaml` → `kloudlab-identity`
2. `app.yaml` → `kloudlab-app`
3. `observability.yaml` → `kloudlab-observability`

For each cluster, confirm its connection is successful first, then manually
sync its root Application. The root's child Applications target the
registered cluster and use that cluster's AppProject. Review prerequisites
before syncing the root.

## Retire the old bootstrap objects safely

The previous `kloudlab-bootstrap` project and seed Application may still exist
in Argo CD. The four old project-wrapper Application manifests have been
removed; after the replacement seed is healthy, delete any live wrappers named
`kloudlab-identity-projects`, `kloudlab-app-project`,
`kloudlab-management-project`, and `kloudlab-observability-project` with
cascading deletion disabled. Their AppProjects remain and are adopted by the
new seed Application.

`kloudlab-management-roots` must not reconcile the Pulumi-owned
`kloudlab-management-applications` while ownership is transferred. The current
manifest temporarily includes only `management-gateway.yaml` and has pruning
off. Sync this change before deleting the live Cilium root Application.

Delete `kloudlab-management-applications` from the Argo CD UI with cascading
deletion **unchecked**. This removes only the root Application; its child
`kloudlab-management-cilium` remains installed. With
`bootstrapManagementRoot` still `true`, run Pulumi preview/update to recreate
the root without Argo managing the same object. The program applies
`RetainOnDelete` to it.

Then set `kloudlab-argocd-management:bootstrapManagementRoot` to `false`, run
`pulumi preview`, confirm the root is retained, and run `pulumi up`. This drops
Pulumi's state entry while leaving the live Application in place. Re-add
`management.yaml` to the `kloudlab-management-roots` directory include and sync
it so Argo adopts the Application as its sole owner. Turn pruning back on only
after that root is healthy.

Finally, delete `kloudlab-project-bootstrap` without cascading, then remove
`kloudlab-bootstrap` from **Settings → Projects** last.
Keep `workload-roots/` until `kloudlab-root` shows its source as
`gitops/management/staged-roots`; then remove that obsolete directory. The
staged cluster roots remain manual sync.

