# KloudLab API

The API validates Auth0 access tokens, stores architecture JSON in PostgreSQL, and checks every create, read, update, and delete against OpenFGA. The frontend's local canvas is only a draft; browser state does not grant workspace permissions. Each user gets an owner relationship to a personal workspace at first use. The editor disables Save while its validation engine reports errors; the API independently checks document structure and authorization.

## OpenFGA model

Create an OpenFGA store and upload `openfga/model.fga`. Configure the API with the resulting store ID and authorization model ID. The API provisions a personal workspace owner tuple for each authenticated Auth0 subject on first create authorization. New architectures receive `owner` and `workspace` tuples. The model also supports `editor` and `viewer` grants; management of those grants will be added with the sharing UI.

## Environment

```sh
PORT=8080
DATABASE_URL=postgres://kloudlab:kloudlab@localhost:5432/kloudlab?sslmode=disable
AUTH0_ISSUER=https://YOUR_AUTH0_DOMAIN/
AUTH0_AUDIENCE=https://api.kloudlab.local
OPENFGA_API_URL=http://localhost:8081
OPENFGA_STORE_ID=YOUR_STORE_ID
OPENFGA_AUTHORIZATION_MODEL_ID=YOUR_MODEL_ID
FRONTEND_ORIGIN=http://localhost:5173
```

Run with Go 1.26 or newer:

```sh
cd apps/api
go run ./cmd/api
```

The API creates its initial `architectures` table at startup. Use a managed PostgreSQL database for production and apply a reviewed migration workflow before deploying schema changes. OpenFGA should be private in production; do not expose its API to browsers.

In the Auth0 dashboard, register `http://localhost:5173/` as an allowed callback URL, logout URL, and web origin. Create an API whose identifier matches `AUTH0_AUDIENCE`; use that audience in the frontend's `VITE_AUTH0_AUDIENCE`. Configure the API issuer with the tenant domain and trailing slash. The SPA uses Authorization Code with PKCE and keeps access tokens in memory.
