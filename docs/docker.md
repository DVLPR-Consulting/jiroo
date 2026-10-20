# Docker images

Build from a reviewed checkout with Docker. No database, auth secret or dotenv
file is needed at build time. Corepack reads the pinned pnpm from `package.json`;
dependencies use the frozen lockfile. Keep the same tag for both targets:

```sh
JIROO_IMAGE_TAG=0.1.0-$(git rev-parse --short HEAD)
docker build --target runner -t "jiroo:$JIROO_IMAGE_TAG" .
docker build --target migrate -t "jiroo-migrate:$JIROO_IMAGE_TAG" .
```

The default target is `runner`: standalone Next.js, static assets and `public`,
running as `node` on port 3000. `migrate` also runs as `node`, retaining the locked
dependencies, including `tsx`, to run the existing maintenance scripts without
a second compilation pipeline. Its preloaded Corepack cache works offline.
No maintenance command runs when the application starts.

## Connect to PostgreSQL

Supply secrets from the operator's environment or secret store, never as image
build arguments or committed files. Both URLs must be reachable **from inside
the container**: `localhost` refers to that container, not the host.

For a local host database, add
`--add-host=host.docker.internal:host-gateway` to each `docker run`, and use
`host.docker.internal` in the database URLs. On the current development machine,
Jiroo uses port 5434; 5433 belongs to another project. No database port needs to
be published by these images. For a database on a Docker network, attach each
container with `--network <existing-network>` and use its database service name.

Create the database and its owner/runtime roles separately. See
[Database roles](database-roles.md) for the required PostgreSQL privileges.
`DIRECT_DATABASE_URL` uses the schema owner; `DATABASE_URL` uses the restricted
runtime role. Set `JIROO_RUNTIME_ROLE` to that existing role's name.

## Migrate, grant and bootstrap

Run migrations manually before starting or updating the application:

```sh
docker run --rm -e DIRECT_DATABASE_URL "jiroo-migrate:$JIROO_IMAGE_TAG"
docker run --rm -e DIRECT_DATABASE_URL -e JIROO_RUNTIME_ROLE \
  "jiroo-migrate:$JIROO_IMAGE_TAG" corepack pnpm db:grant-runtime
```

The default maintenance command is `db:migrate`; it refuses a missing direct
URL. Granting runtime rights is idempotent; repeat it after migrations.

For the first administrator only, supply the application's `DATABASE_URL`,
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and the three `JIROO_ADMIN_*` variables
from [First administrator](first-administrator.md), then run:

```sh
docker run --rm -e DATABASE_URL -e BETTER_AUTH_SECRET -e BETTER_AUTH_URL \
  -e JIROO_ADMIN_EMAIL -e JIROO_ADMIN_NAME -e JIROO_ADMIN_PASSWORD \
  "jiroo-migrate:$JIROO_IMAGE_TAG" corepack pnpm db:bootstrap-admin
unset JIROO_ADMIN_EMAIL JIROO_ADMIN_NAME JIROO_ADMIN_PASSWORD
```

This creates no demo data. Keep the auth secret stable; two-factor enrollment
is required at first sign-in. Do not run `db:seed` in production.

## Run and verify

Set `BETTER_AUTH_URL` to the exact public origin served by your reverse proxy.
Keep the owner's direct URL and administrator credentials out of this container:

```sh
docker run --detach --name jiroo-app --init --restart unless-stopped \
  --publish 127.0.0.1:3000:3000 \
  -e DATABASE_URL -e BETTER_AUTH_SECRET -e BETTER_AUTH_URL \
  "jiroo:$JIROO_IMAGE_TAG"
docker inspect --format '{{.State.Health.Status}}' jiroo-app
```

Forward requests through the TLS reverse proxy. Check `/login` and `/api/health`.
The health endpoint returns 200 when PostgreSQL answers, or an opaque 503 when
it does not. The built-in Node probe checks it every 30 seconds (5-second probe
timeout, 10-second start period, three failures before `unhealthy`); it needs
neither curl nor wget. Docker health status alone does not restart a container.

These commands build and run local images; registry publication, deployment,
backup/rollback procedures and the DSI's image vulnerability scan are separate
release steps. Never use a mutable `latest` tag for production.
