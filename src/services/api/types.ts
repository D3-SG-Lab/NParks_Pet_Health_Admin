/**
 * Request and response types of the NParksPetHealth API v1, taken field by field
 * from docs/NParksPetHealth_API.postman_collection.json. Do not add fields that
 * the collection does not define.
 */

export type IsoDate = string // "YYYY-MM-DD"
export type IsoDateTime = string // "2024-01-10T08:00:00Z" (the live API omits the "Z")

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export type OidcProvider = "singpass" | "corppass"

export interface AuthorizeResponse {
  authorizationUrl: string
  state: string
}

export interface CallbackRequest {
  provider: OidcProvider
  code: string
  state: string
  redirectUri: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: "Bearer"
  expires_in: number
}

export interface RefreshRequest {
  refresh_token: string
}

export type ApiUserType = "pet_owner" | "veterinarian" | "nparks_admin" | "aqc_staff"
export type AqcStaffRole = "officer" | "supervisor" | "vet" | "contractor"

export interface DevTokenRequest {
  userId: number
  userType: ApiUserType
  aqcStaffRole?: AqcStaffRole
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export type AccountStatus = "active" | "inactive" | "suspended"

export interface NParksAdminDto {
  id: number
  fullName: string
  workEmail: string
  accountStatus: AccountStatus
  lastLoginAt: IsoDateTime | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface CreateNParksAdminRequest {
  fullName: string
  workEmail: string
}

export interface VeterinarianDto {
  id: number
  clinicId: number
  fullName: string
  licenceNumber: string
  specialisation: string
  email: string
  accountStatus: AccountStatus
  lastLoginAt: IsoDateTime | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface UpdateAccountStatusRequest {
  status: AccountStatus
}

// ---------------------------------------------------------------------------
// Master data
// ---------------------------------------------------------------------------

export interface PetSpeciesDto {
  id: number
  name: string
  isActive: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface PetBreedDto {
  id: number
  speciesId: number
  speciesName: string
  name: string
  isHdbApproved: boolean
  isActive: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface VaccineTypeDto {
  id: number
  name: string
  description: string
  applicableSpeciesId: number | null
  applicableSpeciesName: string | null
  recommendedIntervalDays: number
  isActive: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface VetSpecialisationDto {
  id: number
  name: string
  isActive: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface NameRequest {
  name: string
}

export interface CreateBreedRequest {
  speciesId: number
  name: string
  isHdbApproved: boolean
}

export interface CreateVaccineTypeRequest {
  name: string
  description: string
  applicableSpeciesId: number | null
  recommendedIntervalDays: number
}

export interface UpdateActiveRequest {
  isActive: boolean
}

// ---------------------------------------------------------------------------
// Animal stay (AQC) & reference data
// ---------------------------------------------------------------------------

export type StaySpecies = "Dog" | "Cat" | "Other"
export type StaySex = "Male" | "Female" | "Unknown"
/**
 * The collection documents "staying"; the live API returns and filters on
 * "active-monitoring" for animals in quarantine (2026-11-17). Both are accepted.
 */
export type StayStatusDto = "active-monitoring" | "staying" | "released" | "deceased"

export interface AnimalStayDto {
  id: number
  name: string
  kennelId: number
  kennelCode: string
  kennelBlock: string
  species: StaySpecies
  sex: StaySex
  countryCode: string
  countryName: string
  microchip: string
  dateOfBirth: IsoDate | null
  arrivalDate: IsoDate
  releaseDate: IsoDate | null
  status: StayStatusDto
  createdBy: number
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface CreateAnimalStayRequest {
  name: string
  kennelId: number
  species: StaySpecies
  sex: StaySex | null
  countryCode: string
  microchip: string
  dateOfBirth: IsoDate | null
  arrivalDate: IsoDate
}

export interface UpdateStayStatusRequest {
  status: "released" | "deceased"
  releaseDate?: IsoDate
}

export interface ListAnimalsQuery {
  status?: StayStatusDto
  species?: StaySpecies
  search?: string
}

export interface KennelDto {
  id: number
  code: string
  block: string
  isActive: boolean
}

export interface CountryDto {
  code: string
  name: string
  isActive: boolean
}

// ---------------------------------------------------------------------------
// Arrival exam & draft
// ---------------------------------------------------------------------------

export type MentationDto = "Responsive" | "Calm" | "Active" | "Alert"
export type ExamSystem = "skin" | "eyes" | "nose" | "ears" | "mouth" | "hydration" | "respiratory"

export interface ExamFindingInput {
  system: ExamSystem
  abnormal: boolean
  note: string | null
  photoKeys: string[]
}

export interface SubmitExamRequest {
  vetStaffId: number | null
  weightKg: number
  mentation: MentationDto
  findings: ExamFindingInput[]
}

export interface ArrivalExamDto {
  id: number
  stayId: number
  vetStaffId: number | null
  weightKg: number
  mentation: MentationDto
  examinedAt: IsoDateTime
  recordedBy: number
  findings: (ExamFindingInput & { id: number })[]
}

export interface ExamDraft {
  vetStaffId: number | null
  weightKg: number | null
  mentation: MentationDto | null
  findings: ExamFindingInput[] | null
}

export interface ArrivalDraftDto {
  detailsJson: unknown
  examJson: ExamDraft | null
  updatedAt: IsoDateTime
}

// ---------------------------------------------------------------------------
// Daily inspection
// ---------------------------------------------------------------------------

export type SessionDto = "AM" | "PM"
export type Food = "Full" | "Half" | "Little" | "None"
export type Stool = "Firm" | "Soft" | "Loose" | "Watery" | "None"
export type Urine = "Yes" | "No"
export type InspectionSystem = "skin" | "eyes" | "nose" | "ears" | "mouth" | "hydration" | "cardiorespiratory"

export interface SubmitInspectionRequest {
  session: SessionDto
  inspectionDate: IsoDate
  mentation: MentationDto
  food: Food
  stool: Stool
  urine: Urine
  otherFindings: string | null
  systemFindings: { system: InspectionSystem; finding: "normal" | "abnormal" }[]
}

export interface DailyInspectionDto {
  id: number
  stayId: number
  inspectionDate: IsoDate
  session: SessionDto
  mentation: MentationDto
  food: Food
  stool: Stool
  urine: Urine
  otherFindings: string | null
  systemFindings: { id: number; system: InspectionSystem; finding: "normal" | "abnormal" }[]
  recordedBy: number
  recordedAt: IsoDateTime
}

// ---------------------------------------------------------------------------
// Observation & media
// ---------------------------------------------------------------------------

export type MediaKind = "photo" | "video"

export interface ObservationMediaInput {
  mediaKind: MediaKind
  mediaKey: string
  durationSec: number | null
  sortOrder: number
}

export interface SubmitObservationRequest {
  stayId: number | null
  text: string
  media: ObservationMediaInput[]
}

export interface ObservationDto {
  id: number
  stayId: number | null
  text: string
  submittedBy: number
  submittedAt: IsoDateTime
  source: string
  status: "processing" | "ready" | string
  aiUnavailable: boolean
  readyAt: IsoDateTime | null
  media: (ObservationMediaInput & { id: number })[]
}

export interface PresignRequest {
  items: { mediaKind: MediaKind; context: "observation" | "exam"; filename: string; contentType: string }[]
}

export interface PresignResponse {
  items: { mediaKey: string; uploadUrl: string; expiresAt: IsoDateTime }[]
}

// ---------------------------------------------------------------------------
// Medication
// ---------------------------------------------------------------------------

export interface MedicationAnimalDto {
  id: number
  name: string
  kennel: string
  species: string
  sex: string
  countryCode: string
  microchip: string
  dateOfBirth: IsoDate | null
  arrivalDate: IsoDate
  releaseDate: IsoDate | null
  status: string
  today: { arrivalExam: string; amInspection: string; pmInspection: string }
}

export interface MedicationAnimalSummaryDto {
  animal: MedicationAnimalDto
  scheduleCount: number
  dueCount: number
  overdueCount: number
}

export interface MedicationAdministrationDto {
  id: number
  scheduleId: number
  animalId: number
  slot: string // "YYYY-MM-DDTHH:mm"
  administeredAt: number // epoch ms
  by: string
  remarks: string | null
}

export interface DoseSlotDto {
  slot: string
  scheduleId: number
  item: string
  dose: string
  frequency: string
  startDate: IsoDate
  endDate: IsoDate
  time: string // "HH:mm"
  status: "upcoming" | "due" | "overdue" | "administered"
  administration: MedicationAdministrationDto | null
}

export interface AnimalMedicationDayDto {
  animal: MedicationAnimalDto
  scheduleCount: number
  slots: DoseSlotDto[]
}

export interface RecordAdministrationRequest {
  scheduleId: number
  slot: string
  remarks: string | null
}

// ---------------------------------------------------------------------------
// Notifications (mobile push tokens — no web UI)
// ---------------------------------------------------------------------------

export interface PushTokenRequest {
  token: string
  platform: "android" | "ios"
}
