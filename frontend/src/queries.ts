import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type City, type Clinic, type Doctor, type TreatmentType } from './api'

export const useCities = () => useQuery({ queryKey: ['cities'], queryFn: () => api.get<City[]>('/api/cities') })

export const useClinics = (includeArchived = false) =>
  useQuery({
    queryKey: ['clinics', { includeArchived }],
    queryFn: () => api.get<Clinic[]>('/api/clinics', { include_archived: includeArchived }),
  })

export const useDoctors = (clinicId?: number | null, includeArchived = false) =>
  useQuery({
    queryKey: ['doctors', { clinicId: clinicId ?? null, includeArchived }],
    queryFn: () => api.get<Doctor[]>('/api/doctors', { clinic_id: clinicId, include_archived: includeArchived }),
  })

export const useTreatmentTypes = (includeArchived = false) =>
  useQuery({
    queryKey: ['treatment-types', { includeArchived }],
    queryFn: () => api.get<TreatmentType[]>('/api/treatment-types', { include_archived: includeArchived }),
  })

/**
 * Records reference each other (a clinic rename shows up in cases, appointments,
 * dashboard), so after any write we refresh everything that's cached.
 */
export function useInvalidateAll() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries()
}
