# AQC Animal Health — Admin web workbench

Next.js admin and officer workbench for the NParks / AVS **AQC Animal Health** POC. It follows the web designs in `../docs/Admin_Design.pdf` and implements the web-facing items of `../docs/Backlogs.xlsx`.

The app runs in one of two modes:

- **API mode** (`NEXT_PUBLIC_API_BASE_URL` set): every screen with a matching endpoint in the NParksPetHealth API (`../docs/NParksPetHealth_API.postman_collection.json`) reads and writes the real API. Screens without an endpoint (cases, review queue, audit, dashboard, templates, taxonomy, glossary, rules, medication schedules) keep the demo data and say so with a "Demo data · no API yet" banner. See [`docs/API_MAPPING.md`](docs/API_MAPPING.md).
- **Demo mode** (variable empty): the whole app runs in the browser on the mock service layer, seeded from the backlog and design references and persisted in `localStorage`.

## Requirements

- **Node.js ≥ 22.11**. Tailwind CSS 4.3 needs `require(esm)`, which is built into Node ≥ 22.12. On 22.11 the `dev`/`build`/`start` scripts turn it on with `--experimental-require-module`, so you'll see a harmless ExperimentalWarning. `.nvmrc` pins Node 24.
- npm 10+

## Getting started

```bash
nvm use            # optional — Node 22.11+ works
npm install
cp .env.example .env.local   # optional
npm run dev        # http://localhost:3000
```

### API mode

Set `NEXT_PUBLIC_API_BASE_URL` (an `https://` origin, without `/api/v1`) in `.env.local` or `.env`, then restart `npm run dev` (it is read at build/start time).

- The browser calls `/backend/api/v1/*` on the app's own origin; `next.config.ts` forwards it to the API, because the API sends no CORS headers.
- **Sign-in**: for now the login form issues a token from `POST /auth/dev-token` (account type, AQC staff role, user id); turn it off with `NEXT_PUBLIC_ENABLE_DEV_LOGIN=false`. Dev-token sessions open every screen, including audit log, users & roles and master data, whatever role was picked (the API grants dev tokens every permission); set `NEXT_PUBLIC_DEV_FULL_ACCESS=false` to apply normal role permissions. OIDC (`GET /auth/authorize` → identity provider → `/auth/callback` → `POST /auth/callback`) shows with `NEXT_PUBLIC_ENABLE_OIDC_LOGIN=true`; register `<app origin>/auth/callback` with the IdP.
- Tokens are kept in `sessionStorage`; every request carries `Authorization: Bearer …`; a 401 triggers one `POST /auth/refresh`, and if that fails the user is signed out. The API has no profile endpoint, so the user's role comes from the token (`user_type`, `role`).
- NParks admins see Users & roles and Master data from the API; AQC staff see animals, inspections, observations and medication. Admin tokens get 403 on animal endpoints.
- No backend handy? `npm run mock:api` starts a contract mock on `http://localhost:7999` that implements exactly the collection's endpoints (in-memory data, fake IdP for OIDC, fake media storage). Set `NEXT_PUBLIC_API_BASE_URL=http://localhost:7999`.

### Demo mode

Sign in with any demo account. The sign-in screen simulates the two identity providers.

| Account   | IdP        | Role       | Notes                                                |
| --------- | ---------- | ---------- | ---------------------------------------------------- |
| J. Tan    | Officer    | Officer    | Default; full operational access                     |
| Dr Lim W. | Officer    | Vet        | Assigned to most cases                               |
| M. Koh    | Officer    | Supervisor | Sees admin nav; admin pages are denied (and audited) |
| R. Lim    | Officer    | Auditor    | Audit log, read-only elsewhere                       |
| S. Wong   | Officer    | Admin      | Users & roles, master data, audit                    |
| K. Lee    | Contractor | Contractor | Kennel scope KC1–KC3                                 |
| S. Ong    | Contractor | Contractor | Kennel scope KC3 only                                |
| A. Pillai | Contractor | Contractor | Disabled, so sign-in is rejected                     |

To start fresh, use **User menu → Reset demo data**. The demo clock starts at _Wed 21 Oct 2026 08:42 (AM session)_ to match the designs. Set `NEXT_PUBLIC_DEMO_NOW=real` to use the current date instead.

## Scripts

| Command                                     | What it does                                                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                               | Development server                                                                                                               |
| `npm run build` / `npm start`               | Production build / serve                                                                                                         |
| `npm run lint`                              | ESLint (Next core-web-vitals + TypeScript)                                                                                       |
| `npm run typecheck`                         | `tsc --noEmit` (strict)                                                                                                          |
| `npm test`                                  | Vitest unit tests (service rules, components)                                                                                    |
| `npx vitest run src/services/cases.test.ts` | Run a single test file (`-t "<name>"` for one test)                                                                              |
| `npm run test:e2e`                          | Playwright, demo mode: smoke, responsive and workflow checks (builds into `.next-mock`; needs `npx playwright install chromium`) |
| `npm run test:e2e:api`                      | Playwright, API mode against the contract mock: asserts every request body (builds into `.next-api`)                             |
| `npm run mock:api`                          | Contract mock of the API on port 7999                                                                                            |
| `npm run format`                            | Prettier (with Tailwind class sorting)                                                                                           |
| `npm run check`                             | Lint + typecheck + unit tests + build                                                                                            |

## Architecture

```text
src/
├── app/                      # Next.js App Router (thin pages, metadata)
│   ├── login/                # Mock OIDC sign-in (Officer / Contractor IdP)
│   └── (dashboard)/          # Authenticated workbench (AppShell)
│       ├── operations/  animals/  cases/  review/
│       ├── inspections/ medication/
│       └── audit/  users/  master-data/
├── features/<module>/        # Screen components per module (client components)
├── components/
│   ├── ui/                   # shadcn/ui primitives (restyled to the design tokens)
│   ├── common/               # Design-system parts: chips, KPI cards, filters, AI card, evidence viewer, states
│   ├── tables/               # Table primitives, sorting, pagination, table states
│   ├── forms/                # Field wrapper, date and date-time pickers
│   └── layout/               # Sidebar (full / rail / drawer), top bar, app shell, permission guard
├── services/                 # Service layer: one function per screen operation (mock or API)
│   ├── api/                  # Axios instance + interceptors, endpoints, typed client, DTO types, errors, tokens
│   └── remote/               # API-mode implementations + DTO ↔ domain mappers
├── lib/
│   ├── mock/                 # In-browser DB, seed data, audit hash chain
│   ├── clock.ts  format.ts   # Demo clock and dd/MM formatting helpers
│   ├── query.ts              # TanStack Query client and mutation helper (toasts, invalidation)
│   └── csv.ts  hash.ts  errors.ts
├── stores/                   # Zustand: session only
├── config/                   # App config, navigation, RBAC matrix
└── types/domain.ts           # Domain model (mirrors BE-002 tables)
```

How the parts fit together:

- **Data flow**: screens call service functions through TanStack Query (`useQuery`) and `useServiceMutation`. After each mutation every query is invalidated, so sidebar badges, KPIs and lists stay consistent.
- **Service layer** (`src/services`): screens only call these functions. In API mode a function with a matching endpoint delegates to `services/remote/*`, which calls `services/api/api-client.ts` and maps the response onto the same view models, so the screens did not change. Otherwise the mock implementation runs: it enforces the role matrix and kennel scoping, validates input, returns `ApiError`s (403/404/409/422), appends hash-chained audit events and sends in-app notifications.
- **Errors**: every API failure becomes an `ApiError` (`services/api/errors.ts` reads `{ error }`, `{ error, message }` and ASP.NET ProblemDetails), so forms show field errors and screens show the same error states. Parts of a screen that fail to load show a warning instead of failing silently.
- **Mock AI worker** (`services/ai-engine.ts`): kennel-code, name and description matching, taxonomy-based sign extraction (synonyms included), and routing suggestions against open and recently closed cases.
- **Next.js 16 Cache Components** are enabled. The authenticated shell is client-rendered behind `<Suspense>` because session and data live in the browser.

## Documentation

- [`docs/DOCUMENTATION_ANALYSIS.md`](docs/DOCUMENTATION_ANALYSIS.md): page map, design system, modules, conflicts and decisions, business rules.
- [`docs/IMPLEMENTATION_CHECKLIST.md`](docs/IMPLEMENTATION_CHECKLIST.md): backlog item → implementation status, plus test and build results.
- [`docs/API_MAPPING.md`](docs/API_MAPPING.md): UI ↔ API endpoint mapping, endpoints without a screen, screens without an endpoint, integration and live-API results.
