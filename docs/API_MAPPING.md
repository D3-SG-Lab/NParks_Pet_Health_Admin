# API mapping — Admin web app ↔ NParksPetHealth API v1

Source of truth: `../docs/NParksPetHealth_API.postman_collection.json` (47 requests, 11 folders, read in full including every example response).
Status legend: **Matched** (endpoint fits the UI as is) · **Partial** (endpoint fits but the UI shows or sends fields the API does not have) · **No API** (UI keeps the mock service layer) · **No UI** (endpoint has no screen in this app).

Sections 1–4 are the mapping made before implementation. **Section 5 records what was integrated and how each endpoint was verified.**

## 1. Contract facts that shape the integration

| Topic                      | What the collection defines                                                                                                                                                                                                          | Consequence for the web app                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Base URL                   | `{{baseUrl}}` (example `https://localhost:7001`), all paths under `/api/v1`                                                                                                                                                          | `NEXT_PUBLIC_API_BASE_URL`                                                                                                             |
| Auth                       | Bearer JWT on every request except `/auth/*`. Tokens: `access_token`, `refresh_token`, `token_type: "Bearer"`, `expires_in: 3600`                                                                                                    | Axios request interceptor adds `Authorization`; on 401 call `POST /auth/refresh` once, then retry; refresh failure → sign-out          |
| Login                      | OIDC: `GET /auth/authorize?provider=singpass\|corppass&redirectUri=` → redirect to `authorizationUrl` → IdP returns `code` + `state` → `POST /auth/callback {provider, code, state, redirectUri}`                                    | Needs a new `/auth/callback` route and a registered redirect URI                                                                       |
| Dev login                  | `POST /auth/dev-token {userId, userType, aqcStaffRole}`; userType `pet_owner\|veterinarian\|nparks_admin\|aqc_staff`; aqcStaffRole `officer\|supervisor\|vet\|contractor`; 404 outside Development                                   | Development-only sign-in path                                                                                                          |
| Current user               | **No `/me` or profile endpoint**                                                                                                                                                                                                     | Identity and role can only come from JWT claims; display name may not be available                                                     |
| Roles                      | `nparks_admin` + AQC staff roles `officer`, `supervisor`, `vet`, `contractor`                                                                                                                                                        | **No `auditor` role** in the API                                                                                                       |
| Errors                     | `{ "error": "<message>" }`; some endpoints add `kind`/`message` (medication 409) or `message`/`field` (push token 400)                                                                                                               | One error normaliser → existing `ApiError` (`VALIDATION` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409) |
| IDs                        | Numeric (`id: 1`)                                                                                                                                                                                                                    | Web app uses string IDs; adapters convert                                                                                              |
| Pagination                 | **None** — every list returns a plain array                                                                                                                                                                                          | Keep client-side paging (`PAGE_SIZE = 10`) over the returned array                                                                     |
| Filtering                  | Server-side only where listed: animals `status`/`species`/`search`; admins & vets `status`; master data `isActive` (+ `speciesId`, `isHdbApproved`) ; kennels/countries `isActive`; inspections `date`; medication `date` (required) | Pass these as query params; all other filters stay client-side                                                                         |
| Animal status              | Stay endpoints: `staying\|released\|deceased`. Medication endpoints return `status: "active-monitoring"` and a `today` object                                                                                                        | Two different vocabularies — mapped in the adapter, flagged as a contract inconsistency                                                |
| Exam vs inspection systems | Exam: `skin, eyes, nose, ears, mouth, hydration, respiratory`. Inspection: same but `cardiorespiratory`                                                                                                                              | Map both to the UI rows "Respiratory" / "Cardio-respiratory"                                                                           |

## 2. UI → API mapping

### Sign-in & session (`/login`, account menu)

| UI functionality                                             | Endpoint                                           | Method     | Mapping status                                                                                                      |
| ------------------------------------------------------------ | -------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| "Continue with Officer IdP" / "Continue with Contractor IdP" | `/api/v1/auth/authorize` → `/api/v1/auth/callback` | GET → POST | Partial — collection only knows providers `singpass` / `corppass`; which one each IdP button uses must be confirmed |
| Development sign-in (demo accounts)                          | `/api/v1/auth/dev-token`                           | POST       | Matched (Development only)                                                                                          |
| Silent session renewal                                       | `/api/v1/auth/refresh`                             | POST       | Matched                                                                                                             |
| Sign out                                                     | `/api/v1/auth/logout`                              | POST       | Matched                                                                                                             |
| Idle timeout                                                 | —                                                  | —          | Client-side (unchanged)                                                                                             |
| Switch demo account / Reset demo data                        | —                                                  | —          | No API (mock mode only)                                                                                             |

### Operations dashboard (`/operations`)

| UI functionality                                                     | Endpoint                                                                                                                                            | Method | Mapping status                |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------- |
| KPI counts, unwell table, alerts, assign follow-up, clear monitoring | —                                                                                                                                                   | —      | No API                        |
| AM/PM check progress per animal                                      | `/api/v1/medication/animals?date=` (`animal.today`) only covers animals with medication; otherwise `GET /animals/{id}/inspections?date=` per animal | GET    | Partial (derived client-side) |
| Medication due/overdue counts                                        | `/api/v1/medication/animals?date=` (`dueCount`, `overdueCount`)                                                                                     | GET    | Matched                       |

### Animals (`/animals`, `/animals/[id]`, `/animals/new`)

| UI functionality                                          | Endpoint                                                                                                                                      | Method         | Mapping status                                                                                                                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| List, tabs Active / Released, search by name or microchip | `/api/v1/animals?status=staying\|released&search=`                                                                                            | GET            | Partial — API has no planned release date, breed or case data, so the "Arriving / Releasing" tabs and the Unwell / Check due chips cannot be computed from the API |
| Species filter                                            | `/api/v1/animals?species=Dog\|Cat\|Other`                                                                                                     | GET            | Matched                                                                                                                                                            |
| Profile header                                            | `/api/v1/animals/{id}` (`name, kennelCode, kennelBlock, species, sex, countryName, microchip, dateOfBirth, arrivalDate, releaseDate, status`) | GET            | Partial — no breed, planned release, monitoring flag                                                                                                               |
| Arrival exam card                                         | `/api/v1/animals/{id}/exam`                                                                                                                   | GET            | Matched (404 = awaiting exam)                                                                                                                                      |
| Today's checks / inspections timeline                     | `/api/v1/animals/{id}/inspections?date=`                                                                                                      | GET            | Matched                                                                                                                                                            |
| Observations timeline                                     | `/api/v1/animals/{id}/observations`                                                                                                           | GET            | Matched                                                                                                                                                            |
| Medication card                                           | `/api/v1/animals/{id}/medication?date=`                                                                                                       | GET            | Matched                                                                                                                                                            |
| Cases on profile, AI summary                              | —                                                                                                                                             | —              | No API                                                                                                                                                             |
| Edit animal details                                       | —                                                                                                                                             | —              | No API (no update endpoint)                                                                                                                                        |
| Release animal                                            | `/api/v1/animals/{id}/status` `{status:"released", releaseDate}`                                                                              | PATCH          | Partial — release note is not stored                                                                                                                               |
| New arrival step 1                                        | `/api/v1/animals` `{name, kennelId, species, sex, countryCode, microchip, dateOfBirth, arrivalDate}`                                          | POST           | Partial — UI fields _breed_ and _planned release date_ have no API field; `arrivalDate` must be added to the form; 409 = active stay for microchip                 |
| Kennel dropdown                                           | `/api/v1/kennels?isActive=true`                                                                                                               | GET            | Partial — no occupancy / species-allowed data                                                                                                                      |
| Origin dropdown                                           | `/api/v1/countries?isActive=true`                                                                                                             | GET            | Matched (`countryCode`)                                                                                                                                            |
| Species dropdown                                          | API body uses enum `Dog\|Cat\|Other`; `/master-data/species` returns a list                                                                   | GET            | Partial — the stay endpoint does not take a species id                                                                                                             |
| Draft kept between steps                                  | `/api/v1/arrival-draft` (GET, DELETE), `/api/v1/arrival-draft/exam` (PUT)                                                                     | GET/PUT/DELETE | Partial — there is no PUT for the _details_ part of the draft                                                                                                      |
| Arrival exam step 2                                       | `/api/v1/animals/{id}/exam` `{vetStaffId, weightKg, mentation, findings[{system, abnormal, note, photoKeys}]}`                                | POST           | Partial — exam "notes" field has no API field; vet list (staff with role vet) has no endpoint                                                                      |
| Exam photos                                               | `/api/v1/media/presign` (`context: "exam"`) + PUT to `uploadUrl`                                                                              | POST           | Matched                                                                                                                                                            |
| Global search (top bar)                                   | `/api/v1/animals?search=`                                                                                                                     | GET            | Partial — cases are not searchable                                                                                                                                 |

### Daily inspections (`/inspections`)

| UI functionality                               | Endpoint                                                                                                                                        | Method | Mapping status                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| Session board (all kennels, done/due/abnormal) | No cross-animal endpoint → `GET /animals?status=staying` + `GET /animals/{id}/inspections?date=` per animal                                     | GET    | Partial (N+1 requests)                                                                    |
| Record AM/PM inspection                        | `/api/v1/animals/{id}/inspections` `{session, inspectionDate, mentation, food, stool, urine, otherFindings, systemFindings[{system, finding}]}` | POST   | Partial — fixed fields; the template-driven form must map to them; 409 = already recorded |
| View a recorded inspection                     | `/api/v1/animals/inspections/{inspectionId}`                                                                                                    | GET    | Matched                                                                                   |
| Edit a recorded inspection                     | —                                                                                                                                               | —      | No API                                                                                    |
| Remind assignees, export                       | —                                                                                                                                               | —      | No API (export stays client-side CSV)                                                     |

### New observation & AI confirmation (`/observations` flow, review queue `/review`)

| UI functionality                                                        | Endpoint                                                                                      | Method | Mapping status                            |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------ | ----------------------------------------- |
| Submit observation (text, optional animal, media)                       | `/api/v1/observations` `{stayId, text, media[{mediaKind, mediaKey, durationSec, sortOrder}]}` | POST   | Matched                                   |
| Media attach                                                            | `/api/v1/media/presign` (`context: "observation"`, ≤ 5 items) + PUT upload                    | POST   | Matched                                   |
| "Analysing…" state                                                      | `/api/v1/observations/{id}` (`status: processing → ready`, `aiUnavailable`)                   | GET    | Matched (polling)                         |
| AI result card (candidates, signs, routing suggestion), Confirm & route | —                                                                                             | —      | No API (no AI result or routing endpoint) |
| Review queue list, triage, skip                                         | —                                                                                             | —      | No API                                    |

### Medication (`/medication`)

| UI functionality                   | Endpoint                                                           | Method | Mapping status                                                        |
| ---------------------------------- | ------------------------------------------------------------------ | ------ | --------------------------------------------------------------------- |
| Due today list with overdue first  | `/api/v1/medication/animals?date=`                                 | GET    | Partial — per-animal counts; per-dose rows come from the day endpoint |
| Dose slots for an animal           | `/api/v1/animals/{id}/medication?date=`                            | GET    | Matched                                                               |
| Record dose                        | `/api/v1/medication/administrations` `{scheduleId, slot, remarks}` | POST   | Matched (409 `already_recorded`)                                      |
| Schedules list, create, edit, stop | —                                                                  | —      | No API                                                                |
| Administration history             | —                                                                  | —      | No API (only per-day `administration` objects)                        |

### Health cases (`/cases`, `/cases/[id]`)

| UI functionality                                                        | Endpoint | Method | Mapping status |
| ----------------------------------------------------------------------- | -------- | ------ | -------------- |
| List, filters, detail, assign, follow-ups, notes, close, reopen, export | —        | —      | No API         |

### Audit log (`/audit`)

| UI functionality                              | Endpoint | Method | Mapping status |
| --------------------------------------------- | -------- | ------ | -------------- |
| Query, detail, CSV export, chain verification | —        | —      | No API         |

### Users & roles (`/users`)

| UI functionality                                                                                                  | Endpoint                                                                          | Method | Mapping status                                                                     |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| List users (Admin role rows)                                                                                      | `/api/v1/admin/nparks-admins?status=`                                             | GET    | Partial — fields `fullName, workEmail, accountStatus, lastLoginAt`; no IdP / scope |
| User detail (Admin)                                                                                               | `/api/v1/admin/nparks-admins/{id}`                                                | GET    | Matched                                                                            |
| Add user (Admin role)                                                                                             | `/api/v1/admin/nparks-admins` `{fullName, workEmail}` (created `inactive`)        | POST   | Partial — role/IdP/scope/invitation are not sent                                   |
| Enable / disable user (Admin)                                                                                     | `/api/v1/admin/nparks-admins/{id}/status` `{status: active\|inactive\|suspended}` | PATCH  | Partial — UI uses Active / Disabled / Invited                                      |
| Delete admin                                                                                                      | `/api/v1/admin/nparks-admins/{id}` (soft delete)                                  | DELETE | No UI action today                                                                 |
| AQC staff (officer, supervisor, vet, contractor, auditor): list, add, edit role & kennel scope, resend invitation | —                                                                                 | —      | No API                                                                             |

### Master data (`/master-data`)

| UI tab                                                                  | Endpoint                                                                                            | Method         | Mapping status                                                                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Species: list, add, enable/disable                                      | `/api/v1/master-data/species` (GET `?isActive`, POST `{name}`), `/species/{id}/status` `{isActive}` | GET/POST/PATCH | Partial — no update (rename) endpoint; description, checklist template, default stay days, kennel types are not in the API |
| Kennels & rooms: list                                                   | `/api/v1/kennels?isActive=` (`id, code, block, isActive`)                                           | GET            | Partial — read only; no type, species allowed, cleaning status                                                             |
| Kennels: add block, add/edit kennel, CSV import                         | —                                                                                                   | —              | No API                                                                                                                     |
| Checklist templates, Symptom taxonomy, AQC glossary, Notification rules | —                                                                                                   | —              | No API                                                                                                                     |

### Notifications (top bar bell)

| UI functionality                    | Endpoint | Method | Mapping status |
| ----------------------------------- | -------- | ------ | -------------- |
| In-app notification list, mark read | —        | —      | No API         |

## 3. Endpoints without a matching screen

| Endpoint                                                             | Why                                                                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET /admin/veterinarians`, `PATCH /admin/veterinarians/{id}/status` | Clinic veterinarians (licence, clinic, specialisation) for the pet-owner side; the admin UI's "Vet" is an AQC staff role |
| Pet breeds (POST, GET, PATCH status)                                 | No breed screen; the stay create body has no breed field, so a breed dropdown could not be saved                         |
| Vaccine types (POST, GET, PATCH status)                              | No vaccine UI in the design                                                                                              |
| Vet specialisations (POST, GET, PATCH status)                        | No UI in the design                                                                                                      |
| `DELETE /admin/nparks-admins/{id}`                                   | The Users screen has disable but no delete action                                                                        |
| `PUT /me/push-token`, `DELETE /me/push-token`                        | Mobile push tokens (FCM/APNs)                                                                                            |
| `PATCH /animals/{id}/status` with `deceased`                         | No "deceased" action in the design                                                                                       |
| `GET /arrival-draft` → `detailsJson`                                 | Readable, but there is no endpoint to write the details portion                                                          |

## 4. Endpoint dependencies

- Every non-auth call needs a token from `/auth/callback`, `/auth/dev-token` or `/auth/refresh`.
- Arrival: `GET /kennels` + `GET /countries` → `POST /animals` → (`POST /media/presign` + PUT) → `POST /animals/{id}/exam`; `DELETE /arrival-draft` after submit.
- Observation: `POST /media/presign` + PUT → `POST /observations` → poll `GET /observations/{id}`.
- Medication: `GET /medication/animals?date` → `GET /animals/{id}/medication?date` → `POST /medication/administrations` (uses `scheduleId` + `slot` from the day response).
- Inspection board: `GET /animals?status=staying` → `GET /animals/{id}/inspections?date` per animal.

## 5. Integration results (2026-11-13)

Verification levels:

- **E2E** — exercised through the UI by `npm run test:e2e:api` against the contract mock (`mock-api/server.mjs`, built from the collection); the test asserts the exact request body and the rendered result.
- **Live** — exercised against `https://linthitd3-001-site1.ktempurl.com` (the URL in `.env.example`).
- **Unit** — `src/services/api/api.test.ts`.

| Endpoint                           | Method       | Used by                                                  | E2E     | Live API                                                            |
| ---------------------------------- | ------------ | -------------------------------------------------------- | ------- | ------------------------------------------------------------------- |
| `/auth/authorize`                  | GET          | Login → Officer / Contractor IdP button                  | ✅      | not tried (needs a registered redirect URI)                         |
| `/auth/callback`                   | POST         | `/auth/callback` page                                    | ✅      | not tried                                                           |
| `/auth/refresh`                    | POST         | Axios 401 interceptor                                    | Unit ✅ | not tried (dev tokens have no refresh token)                        |
| `/auth/logout`                     | POST         | Sign out (only when a refresh token exists)              | —       | not tried                                                           |
| `/auth/dev-token`                  | POST         | Login → Development sign-in                              | ✅      | ✅ 200 (officer and NParks admin)                                   |
| `/admin/nparks-admins`             | GET          | Users & roles list                                       | ✅      | ✅ 200                                                              |
| `/admin/nparks-admins/{id}`        | GET          | Signed-in admin's name                                   | ✅      | ✅ (curl)                                                           |
| `/admin/nparks-admins`             | POST         | Add user (Admin role)                                    | ✅      | not tried (would create a real account)                             |
| `/admin/nparks-admins/{id}/status` | PATCH        | Enable / Disable                                         | ✅      | not tried                                                           |
| `/admin/nparks-admins/{id}`        | DELETE       | Delete (API mode only)                                   | ✅      | not tried                                                           |
| `/master-data/species`             | GET          | Master data → Species                                    | ✅      | ✅ 200 (empty list)                                                 |
| `/master-data/species`             | POST         | Add species                                              | ✅      | not tried (no delete endpoint to undo)                              |
| `/master-data/species/{id}/status` | PATCH        | Active switch                                            | ✅      | not tried                                                           |
| `/animals`                         | GET          | Animals list, search, filters, pickers, board, nav badge | ✅      | ✅ 200 (empty list)                                                 |
| `/animals/{id}`                    | GET          | Animal profile, report, exam step                        | ✅      | ✅ 404 handled                                                      |
| `/animals`                         | POST         | New arrival step 1                                       | ✅      | ❌ **500, empty body** — also for the collection's own example body |
| `/animals/{id}/status`             | PATCH        | Release animal                                           | ✅      | not tried (no stay could be created)                                |
| `/kennels`                         | GET          | Arrival kennel picker, board, Master data → Kennels      | ✅      | ✅ 200 (22 kennels KC1–KC3)                                         |
| `/countries`                       | GET          | Arrival country picker                                   | ✅      | ✅ 200                                                              |
| `/animals/{id}/exam`               | POST         | New arrival step 2                                       | ✅      | not tried                                                           |
| `/animals/{id}/exam`               | GET          | Profile exam card, timeline                              | ✅      | ❌ 500 for a missing stay (collection says 404)                     |
| `/arrival-draft/exam`              | PUT          | Exam draft autosave                                      | ✅      | ❌ 500                                                              |
| `/arrival-draft`                   | GET / DELETE | Draft restore / cleared after submit                     | ✅      | ❌ GET 500                                                          |
| `/animals/{id}/inspections`        | POST         | Record inspection                                        | ✅      | not tried                                                           |
| `/animals/{id}/inspections?date=`  | GET          | Board, profile checks, timeline, sheet                   | ✅      | ❌ 500 for a missing stay                                           |
| `/animals/inspections/{id}`        | GET          | (client function only)                                   | —       | ❌ 500                                                              |
| `/observations`                    | POST         | New observation                                          | ✅      | ✅ 400 validation message shown                                     |
| `/observations/{id}`               | GET          | Poll AI processing status                                | ✅      | ❌ 500                                                              |
| `/animals/{id}/observations`       | GET          | Profile timeline                                         | ✅      | ✅ 404 handled                                                      |
| `/medication/animals?date=`        | GET          | Medication → Due today                                   | ✅      | ❌ **404, route not deployed** (shown on screen)                    |
| `/animals/{id}/medication?date=`   | GET          | Due today rows, profile medication card                  | ✅      | ❌ 404                                                              |
| `/medication/administrations`      | POST         | Record dose                                              | ✅      | ❌ 404                                                              |
| `/media/presign` + PUT `uploadUrl` | POST         | Observation photos/videos                                | ✅      | ✅ 400 validation reached                                           |

Not used by the UI (no matching screen, see §3): veterinarians, breeds, vaccine types, vet specialisations, push tokens. Their client functions exist in `src/services/api/api-client.ts`; the contract mock implements them.

### Contract differences found on the live API

1. **No CORS headers** (`OPTIONS` → 405) — the browser can't call the API directly; the app proxies `/backend/*` through a Next.js route handler (`src/app/backend/[...path]/route.ts`), which also follows the API's http → https redirect on the server.
2. **Validation errors use ASP.NET ProblemDetails** (`{ title, status, errors: { Name: [...] } }`) instead of `{ "error": "..." }` — handled by `src/services/api/errors.ts`.
3. **Dev tokens** last 900 s (collection: 3600) and return `refresh_token: ""`, so dev sessions end after 15 minutes.
4. **Server errors**: `POST /animals`, `GET /arrival-draft`, `PUT /arrival-draft/exam`, `GET …/exam`, `GET …/inspections`, `GET /observations/{id}` return 500 with an empty body for the dev-token user; the medication routes return 404. These need a backend fix (or a valid AQC staff record for the dev-token user id).
5. **NParks admins get 403 on `/animals`** — admins can't see animals, so kennel occupancy is hidden for them.
6. `http://` URLs are redirected (307) to `https://`; the proxy passes the redirect to the browser, which then fails cross-origin. Use the `https://` URL.
