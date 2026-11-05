# AQC Animal Health — Admin web workbench

Next.js admin and officer workbench for the NParks / AVS **AQC Animal Health** POC. It follows the web designs in `../docs/Admin_Design.pdf` and implements the web-facing items of `../docs/Backlogs.xlsx`.

The app runs completely in the browser on a **mock service layer**: data is seeded from the backlog and design references and persisted in `localStorage`. Every screen is functional (CRUD, validation, RBAC, audit trail), and the service layer is isolated so the real NestJS API can replace it later.

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

| Command                                     | What it does                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| `npm run dev`                               | Development server                                                               |
| `npm run build` / `npm start`               | Production build / serve                                                         |
| `npm run lint`                              | ESLint (Next core-web-vitals + TypeScript)                                       |
| `npm run typecheck`                         | `tsc --noEmit` (strict)                                                          |
| `npm test`                                  | Vitest unit tests (service rules, components)                                    |
| `npx vitest run src/services/cases.test.ts` | Run a single test file (`-t "<name>"` for one test)                              |
| `npm run test:e2e`                          | Playwright smoke and responsive checks (needs `npx playwright install chromium`) |
| `npm run format`                            | Prettier (with Tailwind class sorting)                                           |
| `npm run check`                             | Lint + typecheck + unit tests + build                                            |

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
├── services/                 # Service layer = the "API" (async, cloned results, RBAC, audit)
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
- **Service layer** (`src/services`): enforces the role matrix and kennel scoping (`requirePermission`, `requireAnimalAccess`), validates input, returns `ApiError`s with HTTP-like codes (403/404/409/422), appends hash-chained audit events and sends in-app notifications. To connect the real API, replace the function bodies with HTTP calls and keep the signatures.
- **Mock AI worker** (`services/ai-engine.ts`): kennel-code, name and description matching, taxonomy-based sign extraction (synonyms included), and routing suggestions against open and recently closed cases.
- **Next.js 16 Cache Components** are enabled. The authenticated shell is client-rendered behind `<Suspense>` because session and data live in the browser.

## Documentation

- [`docs/DOCUMENTATION_ANALYSIS.md`](docs/DOCUMENTATION_ANALYSIS.md): page map, design system, modules, conflicts and decisions, business rules.
- [`docs/IMPLEMENTATION_CHECKLIST.md`](docs/IMPLEMENTATION_CHECKLIST.md): backlog item → implementation status, plus test and build results.
