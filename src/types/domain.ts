/**
 * Domain model for the AQC Animal Health admin web workbench.
 * Mirrors the tables listed in BE-002 (users, kennels, animals, stays, exams,
 * inspections, observations, media, medication, cases, AI results, summaries,
 * notifications, audit). Dates are ISO strings in Singapore local time
 * ("YYYY-MM-DDTHH:mm:ss") and calendar days are "YYYY-MM-DD".
 */

export type ISODateTime = string
export type ISODate = string

// ---------------------------------------------------------------------------
// Identity, roles & access (BE-004, BE-005, BE-007)
// ---------------------------------------------------------------------------

export type IdentityProvider = "officer" | "contractor"

export type Role = "contractor" | "officer" | "vet" | "supervisor" | "auditor" | "admin"

export type UserStatus = "active" | "disabled" | "invited"

export interface User {
  id: string
  name: string
  email: string
  idp: IdentityProvider
  role: Role
  /** Kennel block codes the user may see. Empty = all kennels for officer-IdP clinical roles. */
  kennelScope: string[]
  status: UserStatus
  lastLoginAt: ISODateTime | null
  createdAt: ISODateTime
}

export type Permission =
  | "record" // Inspect, observe & record medication
  | "arrival" // New arrival & release
  | "triage" // Triage review queue · confirm AI routing
  | "cases" // Assign & close cases
  | "audit" // View & export audit log
  | "admin" // Users, roles & master data

// ---------------------------------------------------------------------------
// Master data (BE-008, FE-023)
// ---------------------------------------------------------------------------

export interface KennelBlock {
  code: string
  name: string
  kind: "kennel" | "isolation"
}

export type KennelType = "Cattery suite" | "Dog run · small" | "Dog run · medium" | "Dog run · large" | "Isolation room"

export type KennelStatus = "in_service" | "cleaning" | "out_of_service"

export interface Kennel {
  code: string
  blockCode: string
  type: KennelType
  speciesAllowed: string[] // species ids
  status: KennelStatus
  /** When status is "cleaning": available again from this day. */
  availableFrom: ISODate | null
}

export interface Species {
  id: string
  name: string
  description: string
  checklistTemplateId: string
  defaultStayDays: number
  kennelTypes: KennelType[]
  enabled: boolean
}

export type ChecklistInput = "single" | "normal_abnormal" | "yes_no" | "free_text"

export interface ChecklistOption {
  label: string
  abnormal: boolean
}

export interface ChecklistItem {
  id: string
  section: string
  label: string
  /** Grouped rows, e.g. "Skin / coat · Eyes · Nose · Ears · Mouth · Hydration". */
  rows: string[]
  input: ChecklistInput
  options: ChecklistOption[]
  defaultOption: string | null
  noteIfAbnormal: boolean
  /** Short description of what changed vs the live version (drafts only). */
  changeNote: string | null
}

export type TemplateVersionStatus = "draft" | "live" | "retired"

export interface ChecklistTemplateVersion {
  version: number
  status: TemplateVersionStatus
  items: ChecklistItem[]
  publishedAt: ISODateTime | null
  updatedAt: ISODateTime
}

export interface ChecklistTemplate {
  id: string
  name: string // e.g. "Dog · daily"
  kind: "daily" | "arrival"
  appliesTo: string // e.g. "Other species", "all species"
  sessions: string // e.g. "AM and PM sessions"
  versions: ChecklistTemplateVersion[]
}

export type BodySystemId = "gastrointestinal" | "dermatological" | "otic" | "ocular" | "respiratory" | "musculoskeletal" | "general"

export interface BodySystem {
  id: BodySystemId
  name: string
  codePrefix: string
}

export interface Sign {
  code: string
  bodySystem: BodySystemId
  name: string
  synonyms: string[]
  relatedWindowDays: number
  active: boolean
}

export type GlossaryCategory = "Location" | "Care" | "Abbreviation" | "Clinical"

export interface GlossaryTerm {
  id: string
  term: string
  meaning: string
  example: string
  category: GlossaryCategory
  updatedAt: ISODateTime
}

export type NotificationEvent =
  "case_created" | "case_reopened" | "case_assigned" | "follow_up_overdue" | "checks_due" | "observation_needs_review" | "daily_digest"

export interface NotificationRule {
  id: string
  event: NotificationEvent
  name: string
  subtitle: string | null
  recipients: string
  channels: { push: boolean; email: boolean }
  timing: string
  enabled: boolean
  /** Escalation settings (follow-up overdue). */
  escalateAfter: number | null
  escalateUnit: "minutes past due" | "hours past due" | null
  escalateTo: string | null
  template: string
}

// ---------------------------------------------------------------------------
// Animals, stays & arrival (BE-009, BE-010)
// ---------------------------------------------------------------------------

export type Sex = "M" | "F"

export type StayStatus = "arriving" | "active" | "released"

export interface Animal {
  id: string
  name: string
  speciesId: string
  breed: string
  sex: Sex
  dateOfBirth: ISODate
  origin: string
  microchip: string // 15 digits, no spaces
  kennelCode: string
  arrivalDate: ISODate
  releaseDate: ISODate
  stayStatus: StayStatus
  releasedAt: ISODateTime | null
  releaseNote: string | null
  /** Manually flagged for closer monitoring without an open case. */
  monitoringFlag: boolean
  monitoringNote: string | null
  /** Follow-up assigned on an animal without an active case (dashboard "Assign"). */
  monitoringAssigneeId: string | null
  monitoringAction: string | null
  monitoringDueAt: ISODateTime | null
  createdAt: ISODateTime
  createdBy: string
}

export type Mentation = "Responsive" | "Calm" | "Active" | "Alert"

export interface ExamFinding {
  system: string
  normal: boolean
  note: string
}

export interface ArrivalExam {
  id: string
  animalId: string
  at: ISODateTime
  vetId: string
  weightKg: number
  mentation: Mentation
  findings: ExamFinding[]
  notes: string
}

/** Derived animal monitoring status shown in chips. */
export type AnimalHealthStatus = "awaiting_exam" | "active" | "monitoring" | "unwell" | "released"

// ---------------------------------------------------------------------------
// Inspections (BE-011)
// ---------------------------------------------------------------------------

export type Session = "AM" | "PM"

export interface InspectionResult {
  itemId: string
  label: string
  value: string
  abnormal: boolean
  note: string
}

export interface Inspection {
  id: string
  animalId: string
  kennelCode: string
  date: ISODate
  session: Session
  at: ISODateTime
  byUserId: string
  templateId: string
  templateVersion: number
  results: InspectionResult[]
  otherFindings: string
  abnormalCount: number
  editedAt: ISODateTime | null
}

// ---------------------------------------------------------------------------
// Observations, media & AI (BE-012, BE-013, AI-002..AI-006)
// ---------------------------------------------------------------------------

export interface MediaRef {
  id: string
  kind: "photo" | "video"
  caption: string
  at: ISODateTime
  byUserId: string
}

export type RoutingAction = "timeline" | "new_case" | "update_case" | "reopen_case"

export interface ExtractedSign {
  code: string
  label: string
}

export interface AiCandidate {
  animalId: string
  confidence: number // 0..1
}

export type AiReviewReason = "no_match" | "low_confidence" | "unavailable"

export interface AiResult {
  promptVersion: string
  model: string
  latencySec: number
  candidates: AiCandidate[]
  matchedAnimalId: string | null
  confidence: number
  signs: ExtractedSign[]
  onset: ISODate | null
  suggestedAction: RoutingAction | null
  suggestedCaseId: string | null
  rationale: string
  reviewReason: AiReviewReason | null
  createdAt: ISODateTime
}

export type ObservationAiStatus = "processing" | "awaiting_confirmation" | "needs_review" | "routed" | "skipped"

export interface Observation {
  id: string
  text: string
  /** Animal chosen by the reporter (optional — AI may match it). */
  reportedAnimalId: string | null
  /** Final animal after AI confirmation or triage. */
  animalId: string | null
  createdAt: ISODateTime
  createdBy: string
  source: "web" | "mobile"
  media: MediaRef[]
  aiStatus: ObservationAiStatus
  ai: AiResult | null
  routedAction: RoutingAction | null
  caseId: string | null
  triagedBy: string | null
  triagedAt: ISODateTime | null
  triageNote: string | null
  skippedCount: number
}

// ---------------------------------------------------------------------------
// Cases (BE-017, BE-018)
// ---------------------------------------------------------------------------

export type CaseStatus = "open" | "needs_review" | "closed"

export type CloseReason = "resolved" | "released" | "duplicate" | "other"

export interface FollowUp {
  id: string
  action: string
  dueAt: ISODateTime
  assigneeId: string
  done: boolean
  doneAt: ISODateTime | null
  createdAt: ISODateTime
  createdBy: string
}

export interface CaseNote {
  id: string
  text: string
  at: ISODateTime
  byUserId: string
}

export interface AiSummary {
  bullets: { text: string; citations: string[] }[]
  updatedAt: ISODateTime
}

export interface HealthCase {
  id: string
  animalId: string
  title: string
  status: CaseStatus
  signCodes: string[]
  openedAt: ISODateTime
  openedBy: string
  assigneeId: string | null
  observationIds: string[]
  inspectionIds: string[]
  followUps: FollowUp[]
  notes: CaseNote[]
  evidence: MediaRef[]
  aiSummary: AiSummary | null
  closedAt: ISODateTime | null
  closedBy: string | null
  closeReason: CloseReason | null
  closeNote: string | null
  reopenedAt: ISODateTime | null
  updatedAt: ISODateTime
}

// ---------------------------------------------------------------------------
// Medication (BE-015)
// ---------------------------------------------------------------------------

export type MedicationRoute = "Oral" | "Topical" | "Ear" | "Eye" | "Injection"

export interface MedicationSchedule {
  id: string
  animalId: string
  item: string
  dose: string
  route: MedicationRoute
  site: string
  frequency: "1x" | "2x" | "3x" | "custom"
  doseTimes: string[] // "HH:mm"
  startDate: ISODate
  endDate: ISODate
  caseId: string | null
  createdAt: ISODateTime
  createdBy: string
  stoppedAt: ISODateTime | null
}

export interface MedicationAdministration {
  id: string
  scheduleId: string
  animalId: string
  date: ISODate
  doseTime: string
  at: ISODateTime
  byUserId: string
  remarks: string
}

// ---------------------------------------------------------------------------
// Notifications (BE-022) & audit (BE-006)
// ---------------------------------------------------------------------------

export interface AppNotification {
  id: string
  userId: string
  title: string
  body: string
  at: ISODateTime
  read: boolean
  href: string | null
}

export type AuditSource = "Web workbench" | "Mobile app · iOS" | "Mobile app · Android" | "AI worker" | "System"

export interface AuditEvent {
  id: string
  seq: number
  at: ISODateTime
  userId: string | null
  userName: string
  userRole: string
  idp: string
  action: string
  entityType: string
  entityId: string
  entityLabel: string
  animalId: string | null
  caseId: string | null
  source: AuditSource
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  prevHash: string
  hash: string
}

export interface AppSettings {
  aiConfidenceThreshold: number
  promptVersion: string
  taxonomyVersion: string
  sessionIdleMinutes: number
}
