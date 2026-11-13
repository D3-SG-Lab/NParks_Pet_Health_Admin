/**
 * One typed function per request in the NParksPetHealth API v1 collection.
 * Payloads and responses follow the collection exactly; mapping to the app's
 * domain model happens in ../remote/*.
 */
import { ENDPOINTS } from "./api-endpoints"
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "./axios-instance"
import type {
  AccountStatus,
  AnimalMedicationDayDto,
  AnimalStayDto,
  ArrivalDraftDto,
  ArrivalExamDto,
  AuthorizeResponse,
  CallbackRequest,
  CountryDto,
  CreateAnimalStayRequest,
  CreateBreedRequest,
  CreateNParksAdminRequest,
  CreateVaccineTypeRequest,
  DailyInspectionDto,
  DevTokenRequest,
  ExamDraft,
  IsoDate,
  KennelDto,
  ListAnimalsQuery,
  MedicationAdministrationDto,
  MedicationAnimalSummaryDto,
  NParksAdminDto,
  ObservationDto,
  OidcProvider,
  PetBreedDto,
  PetSpeciesDto,
  PresignRequest,
  PresignResponse,
  PushTokenRequest,
  RecordAdministrationRequest,
  SubmitExamRequest,
  SubmitInspectionRequest,
  SubmitObservationRequest,
  TokenResponse,
  UpdateStayStatusRequest,
  VaccineTypeDto,
  VeterinarianDto,
  VetSpecialisationDto,
} from "./types"

const E = ENDPOINTS

export const authApi = {
  authorize: (provider: OidcProvider, redirectUri: string) => apiGet<AuthorizeResponse>(E.auth.authorize, { provider, redirectUri }),
  callback: (body: CallbackRequest) => apiPost<TokenResponse>(E.auth.callback, body),
  refresh: (refreshToken: string) => apiPost<TokenResponse>(E.auth.refresh, { refresh_token: refreshToken }),
  logout: (refreshToken: string) => apiPost<void>(E.auth.logout, { refresh_token: refreshToken }),
  devToken: (body: DevTokenRequest) => apiPost<TokenResponse>(E.auth.devToken, body, "Development sign-in"),
}

export const adminApi = {
  listNParksAdmins: (status?: AccountStatus) => apiGet<NParksAdminDto[]>(E.admin.nparksAdmins, { status }),
  getNParksAdmin: (id: number) => apiGet<NParksAdminDto>(E.admin.nparksAdmin(id)),
  createNParksAdmin: (body: CreateNParksAdminRequest) => apiPost<NParksAdminDto>(E.admin.nparksAdmins, body),
  updateNParksAdminStatus: (id: number, status: AccountStatus) => apiPatch<void>(E.admin.nparksAdminStatus(id), { status }),
  deleteNParksAdmin: (id: number) => apiDelete(E.admin.nparksAdmin(id)),
  listVeterinarians: (status?: AccountStatus) => apiGet<VeterinarianDto[]>(E.admin.veterinarians, { status }),
  updateVeterinarianStatus: (id: number, status: AccountStatus) => apiPatch<void>(E.admin.veterinarianStatus(id), { status }),
}

export const masterDataApi = {
  listSpecies: (isActive?: boolean) => apiGet<PetSpeciesDto[]>(E.masterData.species, { isActive }),
  createSpecies: (name: string) => apiPost<PetSpeciesDto>(E.masterData.species, { name }),
  updateSpeciesStatus: (id: number, isActive: boolean) => apiPatch<void>(E.masterData.speciesStatus(id), { isActive }),
  listBreeds: (q: { speciesId?: number; isHdbApproved?: boolean; isActive?: boolean } = {}) =>
    apiGet<PetBreedDto[]>(E.masterData.breeds, q),
  createBreed: (body: CreateBreedRequest) => apiPost<PetBreedDto>(E.masterData.breeds, body),
  updateBreedStatus: (id: number, isActive: boolean) => apiPatch<void>(E.masterData.breedStatus(id), { isActive }),
  listVaccineTypes: (q: { speciesId?: number; isActive?: boolean } = {}) => apiGet<VaccineTypeDto[]>(E.masterData.vaccineTypes, q),
  createVaccineType: (body: CreateVaccineTypeRequest) => apiPost<VaccineTypeDto>(E.masterData.vaccineTypes, body),
  updateVaccineTypeStatus: (id: number, isActive: boolean) => apiPatch<void>(E.masterData.vaccineTypeStatus(id), { isActive }),
  listVetSpecialisations: (isActive?: boolean) => apiGet<VetSpecialisationDto[]>(E.masterData.vetSpecialisations, { isActive }),
  createVetSpecialisation: (name: string) => apiPost<VetSpecialisationDto>(E.masterData.vetSpecialisations, { name }),
  updateVetSpecialisationStatus: (id: number, isActive: boolean) => apiPatch<void>(E.masterData.vetSpecialisationStatus(id), { isActive }),
}

export const animalsApi = {
  create: (body: CreateAnimalStayRequest) => apiPost<AnimalStayDto>(E.animals.list, body),
  get: (id: number) => apiGet<AnimalStayDto>(E.animals.detail(id)),
  list: (q: ListAnimalsQuery = {}) => apiGet<AnimalStayDto[]>(E.animals.list, q),
  updateStatus: (id: number, body: UpdateStayStatusRequest) => apiPatch<void>(E.animals.status(id), body),
}

export const referenceApi = {
  kennels: (isActive?: boolean) => apiGet<KennelDto[]>(E.reference.kennels, { isActive }),
  countries: (isActive?: boolean) => apiGet<CountryDto[]>(E.reference.countries, { isActive }),
}

export const examApi = {
  submit: (stayId: number, body: SubmitExamRequest) => apiPost<ArrivalExamDto>(E.animals.exam(stayId), body),
  get: (stayId: number) => apiGet<ArrivalExamDto>(E.animals.exam(stayId)),
  saveDraft: (body: ExamDraft) => apiPut<void>(E.arrivalDraft.exam, body),
  getDraft: () => apiGet<ArrivalDraftDto>(E.arrivalDraft.draft),
  deleteDraft: () => apiDelete(E.arrivalDraft.draft),
}

export const inspectionsApi = {
  submit: (stayId: number, body: SubmitInspectionRequest) => apiPost<DailyInspectionDto>(E.animals.inspections(stayId), body),
  list: (stayId: number, date?: IsoDate) => apiGet<DailyInspectionDto[]>(E.animals.inspections(stayId), { date }),
  get: (inspectionId: number) => apiGet<DailyInspectionDto>(E.animals.inspection(inspectionId)),
}

export const observationsApi = {
  submit: (body: SubmitObservationRequest) => apiPost<ObservationDto>(E.observations.create, body),
  get: (id: number) => apiGet<ObservationDto>(E.observations.detail(id)),
  listForStay: (stayId: number) => apiGet<ObservationDto[]>(E.animals.observations(stayId)),
}

export const medicationApi = {
  animals: (date: IsoDate) => apiGet<MedicationAnimalSummaryDto[]>(E.medication.animals, { date }, "The medication list"),
  day: (stayId: number, date: IsoDate) =>
    apiGet<AnimalMedicationDayDto>(E.animals.medication(stayId), { date }, "The animal's medication day"),
  recordAdministration: (body: RecordAdministrationRequest) =>
    apiPost<MedicationAdministrationDto>(E.medication.administrations, body, "Recording a dose"),
}

export const mediaApi = {
  presign: (body: PresignRequest) => apiPost<PresignResponse>(E.media.presign, body),
}

/** Mobile push tokens (FCM/APNs). Not used by the web app; kept so the client covers the whole contract. */
export const pushApi = {
  register: (body: PushTokenRequest) => apiPut<void>(E.me.pushToken, body),
  revoke: (platform: PushTokenRequest["platform"]) => apiDelete(E.me.pushToken, { platform }),
}
