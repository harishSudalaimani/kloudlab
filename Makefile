.PHONY: frontend-dev frontend-build api-run api-test infra-fmt infra-test openfga-template

frontend-dev:
	pnpm --dir apps/frontend dev

frontend-build:
	pnpm --dir apps/frontend build

api-run:
	cd apps/api && go run ./cmd/api

api-test:
	cd apps/api && go test ./...

infra-fmt:
	cd infra && gofmt -w $$(find . -type f -name '*.go')

infra-test:
	cd infra && go test ./...

openfga-template:
	helm template openfga openfga --repo https://openfga.github.io/helm-charts --version 0.3.16 --values gitops/clusters/identity/applications/openfga/values.yaml --namespace kloudlab-identity
