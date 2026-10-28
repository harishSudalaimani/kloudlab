# Publish app images to ECR from GitHub Actions

The `Images` workflow builds the API and frontend on `main`, pushes them to the
existing ECR repositories in `ap-south-1`, and then commits short-SHA image
tags to the GitOps Deployment manifests. Argo CD deploys that Git commit. The
workflow uses GitHub OIDC and does not need long-lived AWS access keys.

## Provision the publisher role with Pulumi

The `github-ecr-publisher` Pulumi stack looks up the account's existing GitHub
OIDC provider and creates a separate publishing role. Its trust policy is
limited to the repository and branches configured in that stack. The role
name is `kloudlab-<environment>-github-ecr-publisher`; it does not expand the
permissions of the infrastructure preview role.

The trust subject includes GitHub's immutable repository and owner IDs as well
as their names. GitHub uses this subject format for repositories created after
July 15, 2026; keep the IDs in `Pulumi.yaml` aligned with the repository so
AWS can match the workflow token subject exactly.

The role receives the least-privilege policy in
[`github-actions-ecr-publish.json`](../../infra/components/iam/policies/github-actions-ecr-publish.json).
It can push only to `kloudlab-api` and `kloudlab-frontend` in account
`481665121849`, region `ap-south-1`.

The `dev` stack has been initialized with the existing KMS secrets provider
and applied. To preview or update it later, use the AWS operator profile:

```sh
export AWS_PROFILE=kloudlab
aws sts get-caller-identity
pulumi login 's3://kloudlab-pulumi-state?region=ap-south-1'
cd infra/stacks/github-ecr-publisher
pulumi stack select dev
pulumi preview
```

The initial preview added only the ECR publisher role, its managed policy, and
policy attachment. That plan has been applied; future previews should show no
changes. For any later changes, review the preview before applying:

```sh
pulumi up
pulumi stack output ecrPublisherRoleArn
```

Set the repository variable `AWS_ECR_PUBLISH_ROLE_ARN` to the exported ARN.
The workflow checks that the role belongs to account `481665121849`.

## GitHub Actions permissions

The image job needs `id-token: write` to assume the AWS role. The GitOps update
job needs `contents: write` to commit image tags to `main`. Ensure the
repository Actions settings allow those workflow permissions and that branch
rules permit the Actions token to push the bot commit.

## Cluster pull access

EKS pulls private ECR images through the app node IAM role. The app Deployments
do not use a registry Secret. The `Images` workflow updates both Deployment
references to immutable short-SHA tags only after both image pushes succeed.
