# KloudLab API

The API validates Auth0 access tokens, stores architecture JSON in PostgreSQL, and checks every create, read, update, and delete against OpenFGA. The frontend's local canvas is only a draft; browser state does not grant workspace permissions. Each user gets an owner relationship to a personal workspace at first use. The editor disables Save while its validation engine reports errors; the API independently checks document structure and authorization.

## OpenFGA model

Create an OpenFGA store and upload `internal/authorization/model.fga`. Configure the API with the resulting store ID and authorization model ID. The API provisions a personal workspace owner tuple for each authenticated Auth0 subject on first create authorization. New architectures receive `owner` and `workspace` tuples. The model also supports `editor` and `viewer` grants; management of those grants will be added with the sharing UI. The API authenticates to OpenFGA with a pre-shared bearer token; the browser never receives this token.

## Environment

```sh
PORT=8080
DATABASE_URL=postgres://kloudlab:kloudlab@localhost:5432/kloudlab?sslmode=disable
AUTH0_ISSUER=https://YOUR_AUTH0_DOMAIN/
AUTH0_AUDIENCE=https://api.kloudlab.local
OPENFGA_API_URL=http://localhost:8081
OPENFGA_STORE_ID=YOUR_STORE_ID
OPENFGA_AUTHORIZATION_MODEL_ID=YOUR_MODEL_ID
OPENFGA_API_TOKEN=YOUR_LOCAL_OPENFGA_PRESHARED_KEY
FRONTEND_ORIGIN=http://localhost:5173
```

Run with Go 1.26 or newer:

```sh
cd apps/api
go run ./cmd/api
```

The API creates its initial `architectures` table at startup. The target deployment has Argo CD reconciling the OpenFGA Helm release in the identity cluster and Pulumi provisioning its private Amazon RDS PostgreSQL database; those deployments are not implemented yet. The bundled legacy Bitnami datastore chart is disabled. See [`docs/runbooks/openfga-helm.md`](../../docs/runbooks/openfga-helm.md) for the deployment layout and prerequisites. OpenFGA remains private and must not be exposed to browsers.

In the Auth0 dashboard, register `http://localhost:5173/` as an allowed callback URL, logout URL, and web origin. Create an API whose identifier matches `AUTH0_AUDIENCE`; use that audience in the frontend's `VITE_AUTH0_AUDIENCE`. Configure the API issuer with the tenant domain and trailing slash. The SPA uses Authorization Code with PKCE and keeps access tokens in memory.
