# ThryftVerse API — OpenAPI / Swagger Documentation

The ThryftVerse API ships with auto-generated OpenAPI 3.0 documentation powered by
[`@fastify/swagger`](https://github.com/fastify/fastify-swagger) and
[`@fastify/swagger-ui`](https://github.com/fastify/fastify-swagger-ui).

The OpenAPI specification is generated **from the Fastify route schemas** that are
already declared on every route. There is no hand-written spec to keep in sync —
when a route or schema changes, the documentation updates automatically.

---

## Accessing the Swagger UI

Once the API server is running, open the interactive Swagger UI in a browser:

```
http://localhost:3000/documentation
```

The Swagger UI lets you:

- Browse every documented route grouped by tag.
- Inspect request parameters, body schemas, and response schemas.
- Execute requests directly from the browser ("Try it out") against any
  configured server (Development, Staging, or Production).
- Deep-link to individual operations via the URL fragment
  (e.g. `http://localhost:3000/documentation#/auth/post_auth_login`).

The UI is currently **open without authentication** in all environments so
frontend developers can explore the API without reading backend code. In a future
hardening pass, production deployments may gate `/documentation` behind auth or
disable it entirely via configuration.

## Accessing the raw OpenAPI JSON

The raw OpenAPI 3.0 specification is served as JSON at:

```
http://localhost:3000/documentation/json
```

This endpoint returns a machine-readable document that can be fed into tooling
such as code generators, contract validators, or Postman collections. It is the
single source of truth for the API surface and is always in sync with the running
server.

---

## Adding schema documentation to new routes

`@fastify/swagger` introspects the `schema` option on each Fastify route. To make
a route appear in the documentation, declare a `schema` object with any of the
following keys:

```ts
app.post('/auth/login', {
  schema: {
    description: 'Authenticate a user with email + password and issue a session.',
    tags: ['auth'],
    summary: 'Log in',
    body: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 8 },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
        },
      },
      400: { $ref: '#/components/schemas/ApiError' },
    },
    security: [], // override the global bearerAuth scheme for public routes
  },
  handler: async (request, reply) => { /* ... */ },
});
```

Supported schema keys:

| Key          | Purpose                                                      |
| ------------ | ------------------------------------------------------------ |
| `description`| Human-readable description shown in the UI.                  |
| `summary`    | Short one-line summary.                                      |
| `tags`       | Group routes under a heading in the UI (e.g. `auth`).        |
| `params`     | JSON schema for path parameters.                             |
| `querystring`| JSON schema for query parameters.                            |
| `body`       | JSON schema for the request body.                            |
| `response`   | Map of status code → JSON schema for responses.              |
| `security`   | Per-route security override (use `[]` for public routes).    |

Routes without a `schema` are still registered but will not appear in the
Swagger UI. The swagger plugin is registered **before** all route definitions in
`src/index.ts`, so any schema declared on a route is collected automatically.

---

## Using the OpenAPI spec for frontend code generation

The raw spec at `/documentation/json` can be consumed by code generators to
produce typed API clients for the mobile app or web frontend.

### Example: generating a TypeScript client with `openapi-typescript`

```bash
# Fetch the spec from a running server
curl http://localhost:3000/documentation/json -o openapi.json

# Generate typed schemas
npx openapi-typescript openapi.json -o ../mobile/src/api/schema.ts
```

### Example: generating a full client with `openapi-fetch` + `openapi-typescript`

```bash
npx openapi-typescript openapi.json -o ../mobile/src/api/schema.ts
npm install openapi-fetch
```

```ts
import createClient from 'openapi-fetch';
import type { paths } from './schema';

const client = createClient<paths>({ baseUrl: 'https://api.thryftverse.com' });
const { data, error } = await client.POST('/auth/login', {
  body: { email: '...', password: '...' },
});
```

### Other compatible tools

- [`@hey-api/openapi-ts`](https://heyapi.vercel.app/) — generates typed SDKs.
- [`openapi-generator`](https://openapi-generator.tech/) — multi-language client
  generation (TypeScript, Swift, Kotlin, etc.).
- [`oapi-codegen`](https://github.com/oapi-codegen/oapi-codegen) — Go clients.
- Postman / Insomnia — import the JSON directly as a collection.

Because the spec is generated from the running server, regenerate the client
whenever the API surface changes to keep frontend types in sync with the backend.

---

## Configuration reference

The swagger plugins are registered in `src/index.ts` immediately after the
security middleware (helmet, CORS, rate-limit) and **before** any route
definitions. The configuration includes:

- **Info**: title, description, version, contact, and license metadata.
- **Servers**: Production, Staging, and Development endpoints.
- **Security scheme**: `bearerAuth` (HTTP Bearer with JWT format) applied
  globally; individual public routes override with `security: []`.
- **UI config**: list expansion, deep linking, request duration display, and
  "Try it out" enabled by default.

To change the spec metadata (title, version, servers), edit the `swagger` and
`swaggerUi` registration blocks in `src/index.ts`.
