# Documentation analysis

Source documents (workspace `../docs/`, unchanged):

| File                                                                                                                 | Used for                                                                                     |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Admin_Design.pdf` (17 pages)                                                                                        | UI/UX source of truth for the web workbench: layout, components, colours, typography, states |
| `Backlogs.xlsx` (sheet `Sheet1`, 64 work items; the other names in the workbook are Excel defined names, not sheets) | Functional requirements, modules, acceptance criteria, business rules                        |

## 1. Design reference — page map

| PDF page | Screen                                                                                                                                                                                    | Route in this app                     |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1        | Operations dashboard (desktop)                                                                                                                                                            | `/operations`                         |
| 2        | Animals list                                                                                                                                                                              | `/animals`                            |
| 3        | Animal profile & health record                                                                                                                                                            | `/animals/[id]`                       |
| 4        | Health cases (list + detail)                                                                                                                                                              | `/cases?id=…`                         |
| 5        | Review queue (AI triage)                                                                                                                                                                  | `/review`                             |
| 6        | Inspections session board                                                                                                                                                                 | `/inspections`                        |
| 7        | Medication (due today + add schedule)                                                                                                                                                     | `/medication`                         |
| 8        | Audit log                                                                                                                                                                                 | `/audit`                              |
| 9        | Users & roles + role permissions                                                                                                                                                          | `/users`                              |
| 10–15    | Master data: Kennels & rooms, Species, Checklist templates, Symptom taxonomy, AQC glossary, Notification rules                                                                            | `/master-data?tab=…`                  |
| 16       | Operations — narrow layout (icon rail, card rows)                                                                                                                                         | responsive behaviour of `/operations` |
| 17       | Overlays, states & access: Add-user drawer (FE-023), Close-case dialog (FE-016), Evidence lightbox (FE-024), Access denied (BE-005), table loading/empty/error (FE-025), toasts & banners | shared components                     |

Pages 3 and 4 contain red redaction blocks over timeline text; the text layer underneath was extracted and used for the seed data.

## 2. Design system (extracted)

- **Typeface**: IBM Plex Sans (UI) and IBM Plex Mono (kennel codes, microchips, times, hashes, codes).
- **Colours**: sampled from the page images and stored as tokens in `src/app/globals.css`:
  - sidebar `#0b3d3c` (active `#285453`, indicator `#8fd0c4`)
  - page `#f5f7f6`, cards `#fff`, borders `#dfe4e2`
  - primary teal `#0b6e69`, navy for selected chips and pagination `#1f3a4d`
  - status pairs: success `#13744a`/`#e5f4ed`, warning `#995703`/`#fcf0da`, abnormal `#b33b00`/`#fff1e8`, danger `#a02013`/`#feecea`, info `#1d5a9d`/`#e7effa`, AI lavender `#3d377f`/`#f0f0fc`
- **Shape**: 16 px radius cards, 8–10 px controls, 40 px controls, 64 px table rows, uppercase 11 px table headers, pill filter chips with counts, rounded status chips with a leading dot.
- **Layout**: 248 px sidebar (≥ 1280 px), 84 px icon rail (768–1279 px, p.16), drawer navigation on phones; 64 px top bar with search (`/` shortcut), session clock, notifications and user.

## 3. Modules (from the backlog)

| Module                            | Web scope implemented                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| M1 Arrival & Onboarding           | New arrival (2 steps: details + arrival exam), edit profile, release                         |
| M2 Animal Profile & Health Record | Animal list, profile, timeline, AI summary with citations, PDF export (print)                |
| M3 Daily Health Inspection        | Session board, record and edit inspection (template driven), reminders                       |
| M4 Ad-hoc Health Observation      | New observation with media references, evidence viewer                                       |
| M5 Medication Administration      | Due list, record dose (double-recording blocked), schedules, administration log              |
| M6 AI Routing & Extraction        | Mock AI worker (matching, sign extraction, routing), AI confirmation, review queue           |
| M7 AI Clinical Summary            | 30-day animal summary and case summary, each statement citing record IDs                     |
| M8 Health Case Management         | Case list and detail, assign, follow-ups, notes, evidence, close with reason, reopen         |
| M9 Operations Dashboard           | KPIs, unwell animals, filters, quick assign, web shell                                       |
| M10 Audit & Traceability          | Append-only hash-chained audit, query, detail, CSV export (itself audited)                   |
| M11 Administration                | Users and roles, kennel scopes, all master data tabs                                         |
| M12 Notifications                 | Notification rules, in-app notifications (push/email mirror), reminders, escalation settings |

Mobile-only items (biometric unlock, SecureStore, SQLite offline capture, certificate pinning, device push registration: FE-003 mobile parts, FE-018, FE-019, FE-026) and pure backend or infrastructure items (NestJS, Prisma, Service Bus, Azure OpenAI, Key Vault) are out of scope for this web app. They are represented by the mock service layer (`src/services`) so the real API can replace it later.

## 4. Conflicts found and decisions taken

| #   | Conflict                                                                                                                                                          | Decision                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | FE-001 specifies **Expo + React Native Web**; the request specifies **Next.js**                                                                                   | Next.js (App Router) as requested. The component and token structure follows FE-002, so it could be ported.                                                                                        |
| 2   | Sidebar footer says admin items are visible to **supervisors**, auditors and admins, but the role matrix (p.9, BE-005) gives supervisors **no** admin permissions | The Admin section is shown to every role, as in the p.1 design where officer J. Tan sees it. Items the role can't open carry a lock icon. Each page is gated by the matrix; opening a locked page shows the p.17 access-denied screen, and the attempt is audited. |
| 3   | BE-017 "Only officers can close" vs matrix "Assign & close cases: Officer, Vet, Supervisor"                                                                       | The matrix is applied, with "officers" read as officer-IdP clinical roles.                                                                                                                         |
| 4   | Design shows **42** active animals, but the board has only 18 kennels (KC1–KC3) and BE-003 asks for **20** demo animals                                           | Seeded 17 active animals (one per occupied kennel) plus 6 released. Every count is computed from the data, never hard-coded.                                                                       |
| 5   | Microchips are shown with 14 digits (`900 1234 5678 911`); ISO 11784 chips have **15**                                                                            | 15 digits are stored and validated, displayed as `900 1234 5678 0911`.                                                                                                                             |
| 6   | Design screens are fixed on **Wed 21 Oct 2026, AM session**                                                                                                       | A configurable demo clock (`NEXT_PUBLIC_DEMO_NOW`) anchors the seed data. Set it to `real` to use today.                                                                                           |
| 7   | Inspection board shows Max "Due" while Lucky/Bella are "Overdue" with the same 08:00 due time                                                                     | One rule is applied: a session check is overdue once its due time (AM 08:00 / PM 16:00) has passed. Animals awaiting their arrival exam are excluded from daily checks.                            |
| 8   | Dashboard "Assign" is shown for a monitored animal with **no open case** (Bella)                                                                                  | Assigning sets a monitoring follow-up on the animal; for animals with an active case it adds a follow-up to that case.                                                                             |
| 9   | AI confirmation (FE-012) is a mobile screen; the web needs a home for unconfirmed AI results                                                                      | The web "New observation" dialog shows the confirmation step. Unconfirmed results, and those created from inspections or exams, wait in the Review queue as "Awaiting confirmation".               |
| 10  | FE-008 lists the arrival exam rows with "respiratory"; BE-011 daily rows use "cardiorespiratory"                                                                  | Arrival exam uses Respiratory and the daily checklist uses Cardiorespiratory, as each item states.                                                                                                 |

## 5. Business rules implemented (traceability)

- Microchip unique across active stays; released animals drop out of monitoring and AI matching (BE-009, AI-002).
- Completing the arrival exam starts active monitoring; abnormal exam rows require a note and create observations for AI routing (BE-010, FE-008).
- One AM and one PM inspection per animal per day; edits are audited; any abnormal item or free text publishes an observation for AI routing (BE-011).
- Observations are saved even if AI is unavailable; AI results below the confidence threshold (80%) or without a match go to the review queue (BE-012, BE-019, DES-007).
- Case rules engine: timeline only, update open case, new case, reopen closed case within the related-sign window, with earlier data kept (BE-018).
- Case transitions: invalid transitions return 409; close requires a reason and note (BE-017, FE-016).
- Medication: time and officer captured automatically; double-recording the same dose is blocked; due list shows missed doses (BE-015, FE-013).
- RBAC and kennel scoping are enforced in the service layer. Out-of-scope access returns 403 and is audited (BE-005).
- The audit log is append-only and hash-chained, with verification. Only auditors and admins can query it, and exports are audited (BE-006, BE-023).
- Disabling a user blocks sign-in and API access immediately; all user changes are audited (BE-007).
- Checklist template changes apply to new inspections only, and recorded inspections keep their version (BE-008).
