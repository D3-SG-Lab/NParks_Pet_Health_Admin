# Implementation checklist

Status legend: ✅ implemented in the web app · 🟡 implemented with the mock service layer (real backend/infra pending) · ➖ out of scope for the web admin (mobile-only or infrastructure)

## Frontend (web)

| ID | Item | Status | Where |
| --- | --- | --- | --- |
| FE-001 | App scaffold | ✅ (Next.js instead of Expo, see analysis §4.1) | `src/app`, `src/lib/query.ts` |
| FE-002 | Component library themed from design tokens | ✅ | `src/app/globals.css`, `src/components/{ui,common,tables,forms}` |
| FE-003 | Login & session management | 🟡 mock OIDC sign-in per IdP, idle-timeout warning + expiry, logout | `src/features/auth`, `components/layout/app-shell.tsx` |
| FE-004 | Role-based navigation; hidden actions also blocked by the API | ✅ | `config/rbac.ts`, `config/navigation.ts`, `services/core.ts` |
| FE-005 | Operations home: quick actions, counts, alerts | ✅ | `features/operations` |
| FE-006 | Animal picker & search (contractor scope) | ✅ | `features/observations/animal-picker.tsx`, global search |
| FE-007 | New arrival step 1 (validation, draft kept) | ✅ | `features/animals/arrival-details-form.tsx` |
| FE-008 | Arrival exam step 2 (abnormal rows need a note) | ✅ | `features/animals/arrival-exam-form.tsx` |
| FE-009 | Daily inspection AM/PM (defaults to normal, abnormal → AI) | ✅ | `features/inspections` |
| FE-010 | New health observation (text + media) | ✅ media is a reference only, nothing is uploaded | `features/observations` |
| FE-011 | Media upload manager (SAS, background, resume) | ➖ mobile | — |
| FE-012 | AI confirmation (Correct / Confirm & route, low confidence flagged) | ✅ | `features/observations/ai-confirmation.tsx` |
| FE-013 | Medication administration (due/overdue, no double recording) | ✅ | `features/medication` |
| FE-014 | Animal profile (today, AI summary + citations, timeline filters) | ✅ | `features/animals/animal-detail.tsx`, `health-record.tsx` |
| FE-015 | Health cases list + filters | ✅ | `features/cases/case-list.tsx` |
| FE-016 | Case detail, close with reason, reopen with full history | ✅ | `features/cases` |
| FE-017 | Review queue (count on Operations, triaged items leave) | ✅ | `features/review` |
| FE-018 | Offline capture (SQLite) | ➖ mobile | — |
| FE-019 | Push notifications (device) | ➖ mobile; in-app notification bell mirrors push/email | `components/layout/topbar.tsx` |
| FE-020 | Web workbench shell (usable at 1440 px and 768 px) | ✅ full sidebar / icon rail / drawer | `components/layout` |
| FE-021 | Web operations dashboard (sort/filter without reload, assign from table) | ✅ | `features/operations` |
| FE-022 | Audit view (auditors/admins only, before/after, CSV) | ✅ | `features/audit` |
| FE-023 | Admin screens: users/roles/scopes + all master data | ✅ | `features/users`, `features/master-data` |
| FE-024 | Evidence viewer (zoom, video, view-only) | ✅ placeholders for media | `components/common/evidence.tsx` |
| FE-025 | Loading / empty / error states; accessibility | ✅ every screen; labels, keyboard, skip link | `components/common/states.tsx` |
| FE-026 | Mobile app security | ➖ mobile | — |
| FE-027 | Automated tests | ✅ Vitest (service rules) + Playwright (screens × 3 viewports, key workflows) | `src/services/*.test.ts`, `e2e/` |

## Backend rules exercised through the mock service layer

| ID | Item | Status |
| --- | --- | --- |
| BE-003 | Seed and reference data (one command: *Reset demo data*) | 🟡 |
| BE-004 | Two identity providers, first login activates the user | 🟡 |
| BE-005 | RBAC + kennel scoping on every service call; 403 audited | 🟡 |
| BE-006 | Append-only, hash-chained audit with verification | 🟡 |
| BE-007 | User administration; disabling blocks access immediately | 🟡 |
| BE-008 | Master data CRUD; templates apply to new inspections only; glossary feeds AI | 🟡 |
| BE-009 / BE-010 | Arrival, unique microchip, release; arrival exam starts monitoring | 🟡 |
| BE-011 | One AM + one PM per day, edits audited, abnormal → AI routing | 🟡 |
| BE-012 | Observation saved even if AI unavailable | 🟡 |
| BE-015 | Medication schedules & administrations | 🟡 |
| BE-017 / BE-018 | Case transitions (409), rules engine (timeline / update / new / reopen) | 🟡 |
| BE-019 | Review queue API | 🟡 |
| BE-020 / BE-021 | Timeline (filter/paginate), dashboard counts | 🟡 |
| BE-022 / BE-025 | Notification rules, in-app delivery, check reminders, escalation settings | 🟡 |
| BE-023 / BE-024 | Audit query/export (export audited); PDF (print) & CSV exports | 🟡 |
| AI-002 … AI-005 | Matching, sign extraction (taxonomy + synonyms), routing, 30-day summaries with citations | 🟡 deterministic mock |
| BE-001/002/013/014/016/026, AI-001/006/007/008, DES-007 | NestJS, Prisma, SAS media, workers, outbox, Azure OpenAI, evaluation | ➖ backend / infrastructure |

## Design coverage (Admin_Design.pdf)

All 17 pages are implemented: pp.1–15 as screens, p.16 as responsive behaviour, p.17 as the shared overlays and states (add-user drawer, close-case dialog, evidence lightbox, access denied, table states, toasts and banners).

## Quality gates (last run)

| Check | Result |
| --- | --- |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run typecheck` (strict) | 0 errors |
| `npm test` (Vitest) | 10 files, **62 tests passed** |
| `npm run build` | Succeeded: 18 routes, Cache Components on |
| `npm run test:e2e` (Playwright) | **10 passed**: sign-in, access denied, every screen at 1440 / 768 / 375 px with no console errors and no horizontal overflow, plus workflows (triage → new case, close and reopen case, record dose, new observation → AI confirm, add user) |
