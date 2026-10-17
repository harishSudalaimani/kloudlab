# Local development

1. Start DynamoDB Local with `docker compose up -d dynamodb-local`.
2. Create local tables with `./scripts/create-local-tables.sh`.
3. Copy the public `VITE_*` settings from `web/.env.example` to `web/.env.local`. Do not put backend secrets or AWS credentials in browser variables.
4. Configure the backend using dummy/local Cognito values or a development user pool, then run it with `LAB_PROVIDER=local` and `DYNAMODB_ENDPOINT=http://localhost:8000`.
5. Run the frontend with `cd web && npm install && npm run dev`.

Use `LAB_PROVIDER=local` for local API/UI work. Do not point local development at production tables or production Cognito users. The EC2/SSM provider is legacy code and is not used by the EKS lab plan.

For production infrastructure, review [the Terraform deployment guide](../infra/terraform/PRODUCTION.md). Docker Compose remains part of local development; it is not used in AWS production.
