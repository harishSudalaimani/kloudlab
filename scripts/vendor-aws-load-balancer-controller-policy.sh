#!/usr/bin/env bash
set -euo pipefail

LBC_POLICY_VERSION="v3.6.1"
LBC_POLICY_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../infra/components/iam/policies" && pwd)"
LBC_POLICY_TEMP="${LBC_POLICY_DIR}/.aws-load-balancer-controller-${LBC_POLICY_VERSION}.json.tmp"
LBC_POLICY_FILE="${LBC_POLICY_DIR}/aws-load-balancer-controller-${LBC_POLICY_VERSION}.json"
LBC_POLICY_URL="https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/${LBC_POLICY_VERSION}/docs/install/iam_policy.json"

mkdir -p "${LBC_POLICY_DIR}"
curl --fail --location --silent --show-error "${LBC_POLICY_URL}" --output "${LBC_POLICY_TEMP}"
python3 -m json.tool "${LBC_POLICY_TEMP}" >/dev/null
mv "${LBC_POLICY_TEMP}" "${LBC_POLICY_FILE}"
printf 'Vendored upstream AWS Load Balancer Controller IAM policy %s at %s\n' \
  "${LBC_POLICY_VERSION}" "${LBC_POLICY_FILE}"
