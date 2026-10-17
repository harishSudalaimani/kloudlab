# Local development

Docker Compose is for local development. The current Compose file runs DynamoDB Local in memory; it does not create or run production infrastructure.

1. Install Rust, Node.js/npm, Docker with the Compose plugin, AWS CLI, and Terraform.
2. Copy `.env.example` to `backend/.env`. Add a Cognito test User Pool issuer and public app client ID because the API verifies real Cognito JWTs at startup. Keep local DynamoDB configured as `http://localhost:8000`.
3. Copy the `VITE_*` public values from `.env.example` to `web/.env.local`; do not put backend secrets or AWS credentials in browser variables.
4. Start DynamoDB Local: `docker compose up -d dynamodb-local`.
5. Create the local table with dummy credentials:
   ```sh
   export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_EC2_METADATA_DISABLED=true
   ./scripts/create-local-tables.sh
   ```
6. Run the API in one terminal: `cd backend && cargo run`.
7. Run the frontend in another: `cd web && npm install && npm run dev`.
8. Configure the Cognito test app callback as `http://localhost:5173/callback` and logout URL as `http://localhost:5173/`; use authorization-code grant with PKCE.

Use `LAB_PROVIDER=local` for local API/UI work. Do not point local development at production tables or production Cognito users. The API's EC2/SSM provider is legacy code and is not provisioned by the new EKS Terraform foundation.

For production infrastructure, remote state setup, and the current application integration gap, see [Production Terraform](../infra/terraform/PRODUCTION.md). Terraform plan/apply should only be run after reviewing the generated plan and replacing every example value.
