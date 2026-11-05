/**
 * Reference / master data seed (BE-003): kennels & rooms, species, checklist
 * templates, symptom taxonomy, AQC glossary, notification rules and demo users
 * for each role. Values follow Admin_Design.pdf pp.9–15.
 */
import type {
  BodySystem,
  ChecklistItem,
  ChecklistTemplate,
  GlossaryTerm,
  Kennel,
  KennelBlock,
  NotificationRule,
  Sign,
  Species,
  User,
} from "@/types/domain"

type At = (offsetDays: number, hm: string) => string

export function seedUsers(at: At): User[] {
  const u = (
    id: string,
    name: string,
    email: string,
    idp: User["idp"],
    role: User["role"],
    kennelScope: string[],
    status: User["status"],
    lastLoginAt: string | null
  ): User => ({ id, name, email, idp, role, kennelScope, status, lastLoginAt, createdAt: at(-60, "09:00") })

  return [
    u("u-lim-w", "Dr Lim W.", "lim_wei@nparks.gov.sg", "officer", "vet", [], "active", at(0, "07:30")),
    u("u-tan-j", "J. Tan", "tan_jia@nparks.gov.sg", "officer", "officer", [], "active", at(0, "07:12")),
    u("u-lee-k", "K. Lee", "k.lee@petcare-contractor.sg", "contractor", "contractor", ["KC1", "KC2", "KC3"], "active", at(0, "07:41")),
    u("u-ong-s", "S. Ong", "s.ong@petcare-contractor.sg", "contractor", "contractor", ["KC3"], "active", at(0, "07:55")),
    u("u-koh-m", "M. Koh", "koh_ming@nparks.gov.sg", "officer", "supervisor", [], "active", at(-1, "18:02")),
    u("u-lim-r", "R. Lim", "lim_rachel@nparks.gov.sg", "officer", "auditor", [], "active", at(-1, "09:10")),
    u("u-pillai-a", "A. Pillai", "a.pillai@petcare-contractor.sg", "contractor", "contractor", ["KC2"], "disabled", at(-19, "16:40")),
    u("u-wong-s", "S. Wong", "wong_shu@nparks.gov.sg", "officer", "admin", [], "active", at(0, "08:30")),
    u("u-ng-d", "D. Ng", "ng_daniel@nparks.gov.sg", "officer", "officer", [], "active", at(-1, "17:45")),
    u("u-rajan-p", "Dr Rajan P.", "rajan_priya@nparks.gov.sg", "officer", "vet", [], "active", at(-2, "10:15")),
    u("u-chua-l", "L. Chua", "chua_li@nparks.gov.sg", "officer", "officer", [], "active", at(-1, "07:20")),
    u("u-goh-t", "T. Goh", "goh_teng@nparks.gov.sg", "officer", "supervisor", [], "active", at(-3, "16:30")),
    u("u-yeo-n", "N. Yeo", "yeo_nadia@nparks.gov.sg", "officer", "officer", [], "active", at(-2, "08:05")),
    u("u-hassan-f", "F. Hassan", "f.hassan@petcare-contractor.sg", "contractor", "contractor", ["KC1"], "active", at(-1, "07:35")),
    u("u-tay-b", "B. Tay", "b.tay@petcare-contractor.sg", "contractor", "contractor", ["KC2", "KC3"], "active", at(-1, "16:10")),
    u("u-soh-e", "E. Soh", "e.soh@petcare-contractor.sg", "contractor", "contractor", ["KC1"], "disabled", at(-26, "15:00")),
  ]
}

export function seedKennels(): { blocks: KennelBlock[]; kennels: Kennel[] } {
  const blocks: KennelBlock[] = [
    { code: "KC1", name: "Kennel block 1", kind: "kennel" },
    { code: "KC2", name: "Kennel block 2", kind: "kennel" },
    { code: "KC3", name: "Kennel block 3", kind: "kennel" },
    { code: "ISO", name: "Isolation ward", kind: "isolation" },
  ]
  const k = (
    code: string,
    type: Kennel["type"],
    speciesAllowed: string[],
    status: Kennel["status"] = "in_service",
    availableFrom: string | null = null
  ): Kennel => ({
    code,
    blockCode: code.split("-")[0],
    type,
    speciesAllowed,
    status,
    availableFrom,
  })
  const kennels: Kennel[] = [
    k("KC1-1", "Dog run · medium", ["dog"]),
    k("KC1-2", "Cattery suite", ["cat"]),
    k("KC1-3", "Dog run · small", ["dog", "other"]),
    k("KC1-4", "Dog run · medium", ["dog"]),
    k("KC1-5", "Cattery suite", ["cat"]),
    k("KC1-6", "Cattery suite", ["cat"]),
    k("KC2-1", "Cattery suite", ["cat"]),
    k("KC2-2", "Dog run · small", ["dog", "other"]),
    k("KC2-3", "Dog run · medium", ["dog"]),
    k("KC2-4", "Dog run · medium", ["dog"]),
    k("KC2-5", "Cattery suite", ["cat"]),
    k("KC2-6", "Dog run · large", ["dog"]),
    k("KC3-1", "Cattery suite", ["cat"]),
    k("KC3-2", "Dog run · medium", ["dog"]),
    k("KC3-3", "Cattery suite", ["cat"]),
    k("KC3-4", "Dog run · small", ["dog", "other"], "cleaning", null),
    k("KC3-5", "Dog run · medium", ["dog"]),
    k("KC3-6", "Dog run · large", ["dog"]),
    k("ISO-1", "Isolation room", ["dog", "cat", "other"]),
    k("ISO-2", "Isolation room", ["dog", "cat", "other"]),
    k("ISO-3", "Isolation room", ["dog", "cat", "other"]),
    k("ISO-4", "Isolation room", ["dog", "cat", "other"]),
  ]
  return { blocks, kennels }
}

export function seedSpecies(): Species[] {
  return [
    {
      id: "dog",
      name: "Dog",
      description: "",
      checklistTemplateId: "tpl-dog",
      defaultStayDays: 30,
      kennelTypes: ["Dog run · small", "Dog run · medium", "Dog run · large"],
      enabled: true,
    },
    {
      id: "cat",
      name: "Cat",
      description: "",
      checklistTemplateId: "tpl-cat",
      defaultStayDays: 30,
      kennelTypes: ["Cattery suite"],
      enabled: true,
    },
    {
      id: "other",
      name: "Other",
      description: "Rabbits, guinea pigs, birds",
      checklistTemplateId: "tpl-general",
      defaultStayDays: 30,
      kennelTypes: ["Dog run · small", "Isolation room"],
      enabled: true,
    },
  ]
}

const BODY_ROWS = ["Skin / coat", "Eyes", "Nose", "Ears", "Mouth", "Hydration"]
const NA = [
  { label: "Normal", abnormal: false },
  { label: "Abnormal", abnormal: true },
]

function item(partial: Partial<ChecklistItem> & Pick<ChecklistItem, "id" | "section" | "label" | "input">): ChecklistItem {
  return { rows: [], options: [], defaultOption: null, noteIfAbnormal: false, changeNote: null, ...partial }
}

/** Daily checklist items (FE-009, BE-011). `watery` adds the v4 "Watery" stool option. */
export function dailyItems(opts: { watery?: boolean; species?: "dog" | "cat" | "other" } = {}): ChecklistItem[] {
  const stoolOptions = [
    { label: "Firm", abnormal: false },
    { label: "Soft", abnormal: true },
    { label: "Loose", abnormal: true },
    ...(opts.watery ? [{ label: "Watery", abnormal: true }] : []),
    { label: "None", abnormal: true },
  ]
  return [
    item({
      id: "mentation",
      section: "Mentation",
      label: "Mentation",
      input: "single",
      options: ["Responsive", "Calm", "Active", "Alert"].map((label) => ({ label, abnormal: false })),
      defaultOption: "Responsive",
    }),
    item({
      id: "body",
      section: "Body systems",
      label: BODY_ROWS.join(" · "),
      rows: BODY_ROWS,
      input: "normal_abnormal",
      options: NA,
      defaultOption: "Normal",
      noteIfAbnormal: true,
    }),
    item({
      id: "cardio",
      section: "Body systems",
      label: "Cardiorespiratory",
      input: "normal_abnormal",
      options: NA,
      defaultOption: "Normal",
      noteIfAbnormal: true,
    }),
    item({
      id: "food",
      section: "Intake & output",
      label: "Food",
      input: "single",
      options: [
        { label: "Full", abnormal: false },
        { label: "Half", abnormal: true },
        { label: "Little", abnormal: true },
        { label: "None", abnormal: true },
      ],
      defaultOption: "Full",
    }),
    item({
      id: "stool",
      section: "Intake & output",
      label: "Stool",
      input: "single",
      options: stoolOptions,
      defaultOption: "Firm",
      changeNote: opts.watery ? "Added “Watery”" : null,
    }),
    item({
      id: "urine",
      section: "Intake & output",
      label: "Urine",
      input: "yes_no",
      options: [
        { label: "Yes", abnormal: false },
        { label: "No", abnormal: true },
      ],
      defaultOption: "Yes",
    }),
    item({ id: "other", section: "Other", label: "Other findings", input: "free_text" }),
  ]
}

/** Arrival exam (FE-008): mentation + physical exam rows incl. respiratory. */
export function arrivalItems(): ChecklistItem[] {
  return [
    item({
      id: "mentation",
      section: "Mentation",
      label: "Mentation",
      input: "single",
      options: ["Responsive", "Calm", "Active", "Alert"].map((label) => ({ label, abnormal: false })),
      defaultOption: "Responsive",
    }),
    item({
      id: "physical",
      section: "Physical exam",
      label: [...BODY_ROWS, "Respiratory"].join(" · "),
      rows: [...BODY_ROWS, "Respiratory"],
      input: "normal_abnormal",
      options: NA,
      defaultOption: "Normal",
      noteIfAbnormal: true,
    }),
    item({ id: "other", section: "Other", label: "Exam notes", input: "free_text" }),
  ]
}

export function seedTemplates(at: At): ChecklistTemplate[] {
  return [
    {
      id: "tpl-dog",
      name: "Dog · daily",
      kind: "daily",
      appliesTo: "Dog",
      sessions: "AM and PM sessions",
      versions: [
        { version: 1, status: "retired", items: dailyItems(), publishedAt: at(-200, "09:00"), updatedAt: at(-200, "09:00") },
        { version: 2, status: "retired", items: dailyItems(), publishedAt: at(-120, "09:00"), updatedAt: at(-120, "09:00") },
        { version: 3, status: "live", items: dailyItems(), publishedAt: at(-50, "09:00"), updatedAt: at(-50, "09:00") },
        { version: 4, status: "draft", items: dailyItems({ watery: true }), publishedAt: null, updatedAt: at(0, "08:32") },
      ],
    },
    {
      id: "tpl-cat",
      name: "Cat · daily",
      kind: "daily",
      appliesTo: "Cat",
      sessions: "AM and PM sessions",
      versions: [
        { version: 1, status: "retired", items: dailyItems(), publishedAt: at(-200, "09:00"), updatedAt: at(-200, "09:00") },
        { version: 2, status: "live", items: dailyItems(), publishedAt: at(-50, "09:00"), updatedAt: at(-50, "09:00") },
      ],
    },
    {
      id: "tpl-general",
      name: "General · daily",
      kind: "daily",
      appliesTo: "Other species",
      sessions: "AM and PM sessions",
      versions: [{ version: 1, status: "live", items: dailyItems(), publishedAt: at(-90, "09:00"), updatedAt: at(-90, "09:00") }],
    },
    {
      id: "tpl-arrival",
      name: "Arrival exam",
      kind: "arrival",
      appliesTo: "all species",
      sessions: "On arrival",
      versions: [
        { version: 1, status: "retired", items: arrivalItems(), publishedAt: at(-200, "09:00"), updatedAt: at(-200, "09:00") },
        { version: 2, status: "live", items: arrivalItems(), publishedAt: at(-50, "09:00"), updatedAt: at(-50, "09:00") },
      ],
    },
  ]
}

export const BODY_SYSTEMS: BodySystem[] = [
  { id: "gastrointestinal", name: "Gastrointestinal", codePrefix: "GI" },
  { id: "dermatological", name: "Dermatological", codePrefix: "DE" },
  { id: "otic", name: "Otic (ears)", codePrefix: "OT" },
  { id: "ocular", name: "Ocular (eyes)", codePrefix: "OC" },
  { id: "respiratory", name: "Respiratory", codePrefix: "RE" },
  { id: "musculoskeletal", name: "Musculoskeletal", codePrefix: "MS" },
  { id: "general", name: "General & behaviour", codePrefix: "GB" },
]

export function seedSigns(): Sign[] {
  const s = (
    code: string,
    bodySystem: Sign["bodySystem"],
    name: string,
    synonyms: string[],
    relatedWindowDays: number,
    active = true
  ): Sign => ({ code, bodySystem, name, synonyms, relatedWindowDays, active })
  return [
    s("GI-001", "gastrointestinal", "Soft stool", ["loose-ish", "mushy", "not firm", "soft stool"], 14),
    s("GI-002", "gastrointestinal", "Diarrhoea", ["watery stool", "runny", "loose stool"], 14),
    s("GI-003", "gastrointestinal", "Vomiting", ["threw up", "regurgitated", "sick", "vomited"], 7),
    s("GI-004", "gastrointestinal", "Reduced appetite", ["ate half", "picky", "not keen", "left most"], 7),
    s("GI-005", "gastrointestinal", "Anorexia", ["not eating", "refused food"], 7),
    s("GI-006", "gastrointestinal", "Blood in stool", ["haematochezia", "red stool"], 30),
    s("GI-007", "gastrointestinal", "Flatulence", ["gassy"], 7),
    s("GI-008", "gastrointestinal", "Constipation", ["straining"], 7, false),
    s("DE-001", "dermatological", "Pruritus", ["itchy", "itching", "scratching"], 14),
    s("DE-002", "dermatological", "Erythema", ["redness", "red skin"], 14),
    s("DE-003", "dermatological", "Alopecia", ["hair loss", "bald patch"], 30),
    s("DE-004", "dermatological", "Skin lesion", ["sore", "wound", "scab", "lesion"], 14),
    s("DE-005", "dermatological", "Scaling", ["flaky skin", "dandruff"], 14),
    s("DE-006", "dermatological", "Hot spot", ["moist patch"], 14),
    s("DE-007", "dermatological", "Swelling / lump", ["lump", "bump"], 30),
    s("OT-001", "otic", "Pruritus · ear", ["scratching ear", "scratching right ear", "scratching left ear", "shaking head"], 14),
    s("OT-002", "otic", "Ear discharge", ["waxy discharge", "gunk in ear"], 14),
    s("OT-003", "otic", "Erythema · ear", ["red ear", "some redness"], 14),
    s("OT-004", "otic", "Head tilt", ["tilting head"], 30),
    s("OT-005", "otic", "Ear malodour", ["smelly ear"], 14),
    s("OC-001", "ocular", "Ocular discharge", ["eye discharge", "eye gunk", "crusty eye"], 14),
    s("OC-002", "ocular", "Conjunctivitis", ["red eye", "pink eye"], 14),
    s("OC-003", "ocular", "Blepharospasm", ["squinting", "half closed eye"], 7),
    s("OC-004", "ocular", "Corneal opacity", ["cloudy eye"], 30),
    s("OC-005", "ocular", "Epiphora", ["watery eye", "tearing"], 7),
    s("RE-001", "respiratory", "Cough", ["coughing", "hacking", "mild cough"], 14),
    s("RE-002", "respiratory", "Nasal discharge", ["runny nose", "snotty", "nasal discharge"], 14),
    s("RE-003", "respiratory", "Sneezing", ["sneeze", "sneezes"], 7),
    s("RE-004", "respiratory", "Tachypnoea", ["fast breathing", "panting at rest"], 7),
    s("RE-005", "respiratory", "Dyspnoea", ["breathing hard", "laboured breathing"], 7),
    s("RE-006", "respiratory", "Reverse sneezing", ["honking"], 7),
    s("MS-001", "musculoskeletal", "Lameness", ["limping", "limp", "not weight bearing"], 14),
    s("MS-002", "musculoskeletal", "Joint swelling", ["swollen joint"], 14),
    s("MS-003", "musculoskeletal", "Stiffness", ["stiff", "slow to rise"], 14),
    s("MS-004", "musculoskeletal", "Reluctance to move", ["won't move", "reluctant to walk"], 7),
    s("GB-001", "general", "Lethargy", ["quiet", "flat", "dull", "lethargic"], 7),
    s("GB-002", "general", "Pyrexia", ["fever", "hot ears"], 7),
    s("GB-003", "general", "Weight loss", ["lost weight", "thin"], 30),
    s("GB-004", "general", "Polydipsia", ["drinking more", "drinking a lot"], 14),
    s("GB-005", "general", "Anxiety", ["pacing", "restless", "stressed"], 7),
    s("GB-006", "general", "Aggression", ["snappy", "growling"], 14),
  ]
}

export function seedGlossary(at: At): GlossaryTerm[] {
  const g = (
    id: string,
    term: string,
    meaning: string,
    category: GlossaryTerm["category"],
    example: string,
    updatedAt: string
  ): GlossaryTerm => ({ id, term, meaning, category, example, updatedAt })
  return [
    g(
      "g-01",
      "corner run",
      "Outdoor end run of a kennel block; maps to the last kennel in that block (e.g. KC2 → KC2-6)",
      "Location",
      "dog in KC2 corner run scratching",
      at(0, "08:10")
    ),
    g("g-02", "KC", "Kennel block code; followed by block and kennel number (KC2-2)", "Location", "KC2-2 soft stool", at(-50, "09:00")),
    g("g-03", "ISO", "Isolation ward room for suspected infectious cases", "Location", "moved to ISO-1 for monitoring", at(-50, "09:00")),
    g("g-04", "bland diet", "Boiled chicken and rice feed prescribed for GI upset", "Care", "started bland diet this AM", at(-3, "10:05")),
    g("g-05", "probio", "Shorthand for the probiotic supplement", "Abbreviation", "probio given 08:00", at(-5, "09:30")),
    g("g-06", "BAR", "Bright, alert, responsive — normal mentation", "Abbreviation", "BAR, eating well", at(-50, "09:00")),
    g("g-07", "ate half", "Food intake “Half” on the inspection scale", "Clinical", "ate half of breakfast", at(-50, "09:00")),
    g("g-08", "QAR", "Quarantine animal record — the stay record for one animal", "Abbreviation", "update the QAR", at(-50, "09:00")),
    g("g-09", "AVS", "Animal & Veterinary Service (NParks)", "Abbreviation", "AVS officer on duty", at(-50, "09:00")),
    g("g-10", "SID / BID / TID", "Once / twice / three times daily dosing", "Abbreviation", "probiotic BID", at(-50, "09:00")),
    g("g-11", "NAD", "No abnormality detected", "Clinical", "ears NAD", at(-50, "09:00")),
    g("g-12", "inappetent", "Reduced or absent appetite", "Clinical", "inappetent since PM feed", at(-40, "09:00")),
    g("g-13", "run", "Outdoor exercise area attached to a dog kennel", "Location", "loose stool in run", at(-50, "09:00")),
    g("g-14", "cattery", "Cat accommodation suite (KCx cattery suite)", "Location", "cattery KC2-5", at(-50, "09:00")),
    g("g-15", "PO", "Per os — given by mouth", "Abbreviation", "maropitant PO", at(-50, "09:00")),
    g("g-16", "walk-out", "Supervised exercise outside the kennel", "Care", "skipped walk-out due to rain", at(-30, "09:00")),
    g(
      "g-17",
      "head shaking",
      "Repeated shaking of the head — often ear discomfort",
      "Clinical",
      "head shaking after ear drops",
      at(-20, "09:00")
    ),
    g("g-18", "MM", "Mucous membranes (gum colour)", "Abbreviation", "MM pink, CRT < 2 s", at(-50, "09:00")),
    g("g-19", "CRT", "Capillary refill time", "Abbreviation", "CRT < 2 s", at(-50, "09:00")),
    g("g-20", "food scale", "Inspection food intake scale: Full / Half / Little / None", "Clinical", "food scale Half", at(-50, "09:00")),
  ]
}

export function seedNotificationRules(): NotificationRule[] {
  const r = (
    id: string,
    event: NotificationRule["event"],
    name: string,
    recipients: string,
    push: boolean,
    email: boolean,
    timing: string,
    enabled: boolean,
    template: string,
    extra: Partial<NotificationRule> = {}
  ): NotificationRule => ({
    id,
    event,
    name,
    subtitle: null,
    recipients,
    channels: { push, email },
    timing,
    enabled,
    escalateAfter: null,
    escalateUnit: null,
    escalateTo: null,
    template,
    ...extra,
  })
  return [
    r(
      "nr-1",
      "case_created",
      "New case created",
      "Assigned officer · Vets",
      true,
      true,
      "Immediately",
      true,
      "New case {case} · {kennel} {pet}: {action}"
    ),
    r(
      "nr-2",
      "case_reopened",
      "Case reopened",
      "Assigned officer · Vets",
      true,
      true,
      "Immediately",
      true,
      "Case {case} reopened · {kennel} {pet}"
    ),
    r(
      "nr-3",
      "case_assigned",
      "Case assigned to you",
      "Assignee",
      true,
      false,
      "Immediately",
      true,
      "{action} · {kennel} {pet}, due {due}. Tap to open case {case}."
    ),
    r(
      "nr-4",
      "follow_up_overdue",
      "Follow-up overdue",
      "Assignee → Supervisor",
      true,
      true,
      "2 h after due",
      true,
      "“{action}” was due {due}. Tap to open case {case}.",
      {
        subtitle: "Escalation",
        escalateAfter: 2,
        escalateUnit: "hours past due",
        escalateTo: "Supervisors (all kennels)",
      }
    ),
    r(
      "nr-5",
      "checks_due",
      "Checks due",
      "Contractors & officers in scope",
      true,
      false,
      "30 min before session end",
      true,
      "{kennel} {pet} still needs its inspection — session closes {due}."
    ),
    r(
      "nr-6",
      "observation_needs_review",
      "Observation needs review",
      "Officers on duty",
      true,
      false,
      "Immediately",
      true,
      "An observation needs manual routing: {action}"
    ),
    r("nr-7", "daily_digest", "Daily digest", "Supervisors", false, true, "18:00 daily", false, "Today: {action}"),
  ]
}
