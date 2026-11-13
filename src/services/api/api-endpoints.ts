/** Every path in the NParksPetHealth API v1 collection, relative to `/api/v1`. */
type Id = number | string

export const ENDPOINTS = {
  auth: {
    authorize: "/auth/authorize",
    callback: "/auth/callback",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    devToken: "/auth/dev-token",
  },
  admin: {
    nparksAdmins: "/admin/nparks-admins",
    nparksAdmin: (id: Id) => `/admin/nparks-admins/${id}`,
    nparksAdminStatus: (id: Id) => `/admin/nparks-admins/${id}/status`,
    veterinarians: "/admin/veterinarians",
    veterinarianStatus: (id: Id) => `/admin/veterinarians/${id}/status`,
  },
  masterData: {
    species: "/master-data/species",
    speciesStatus: (id: Id) => `/master-data/species/${id}/status`,
    breeds: "/master-data/breeds",
    breedStatus: (id: Id) => `/master-data/breeds/${id}/status`,
    vaccineTypes: "/master-data/vaccine-types",
    vaccineTypeStatus: (id: Id) => `/master-data/vaccine-types/${id}/status`,
    vetSpecialisations: "/master-data/vet-specialisations",
    vetSpecialisationStatus: (id: Id) => `/master-data/vet-specialisations/${id}/status`,
  },
  animals: {
    list: "/animals",
    detail: (id: Id) => `/animals/${id}`,
    status: (id: Id) => `/animals/${id}/status`,
    exam: (id: Id) => `/animals/${id}/exam`,
    inspections: (id: Id) => `/animals/${id}/inspections`,
    inspection: (inspectionId: Id) => `/animals/inspections/${inspectionId}`,
    observations: (id: Id) => `/animals/${id}/observations`,
    medication: (id: Id) => `/animals/${id}/medication`,
  },
  reference: {
    kennels: "/kennels",
    countries: "/countries",
  },
  arrivalDraft: {
    draft: "/arrival-draft",
    exam: "/arrival-draft/exam",
  },
  observations: {
    create: "/observations",
    detail: (id: Id) => `/observations/${id}`,
  },
  medication: {
    animals: "/medication/animals",
    administrations: "/medication/administrations",
  },
  media: {
    presign: "/media/presign",
  },
  me: {
    pushToken: "/me/push-token",
  },
} as const
