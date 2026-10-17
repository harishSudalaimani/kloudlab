#!/usr/bin/env sh
set -eu

endpoint="${DYNAMODB_ENDPOINT:-http://localhost:8000}"
table="${SESSIONS_TABLE:-kloudlab-local-sessions}"

aws dynamodb create-table \
  --endpoint-url "$endpoint" \
  --table-name "$table" \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=GSI1PK,AttributeType=S \
    AttributeName=GSI1SK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes '[{"IndexName":"GSI1","KeySchema":[{"AttributeName":"GSI1PK","KeyType":"HASH"},{"AttributeName":"GSI1SK","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --region "${AWS_REGION:-ap-south-1}"
