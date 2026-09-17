import {
  api,
  type Case,
  type CaseList,
  type City,
  type Clinic,
  type ClinicRef,
  type Doctor,
  type Patient,
  type Ref,
} from '../api'
import { clinicLabel, statusLabel } from '../format'
import { EntitySelect } from './EntitySelect'
import { CityForm, ClinicForm, DoctorForm, PatientForm, TreatmentTypeForm } from './forms'

type SelectProps<T> = {
  value: T | null
  onChange: (item: T | null) => void
  label?: string
  clearable?: boolean
  disabled?: boolean
  hint?: React.ReactNode
}

export function CitySelect({ label = 'City', ...p }: SelectProps<City>) {
  return (
    <EntitySelect<City>
      {...p}
      label={label}
      noun="city"
      queryKey={['cities']}
      fetchItems={() => api.get('/api/cities')}
      getLabel={(c) => c.name}
      renderAdd={(a) => <CityForm initialName={a.initialName} onDone={a.onDone} onCancel={a.onCancel} />}
    />
  )
}

export function ClinicSelect({ label = 'Clinic', ...p }: SelectProps<ClinicRef>) {
  return (
    <EntitySelect<ClinicRef>
      {...p}
      label={label}
      noun="clinic"
      queryKey={['clinics', { includeArchived: false }]}
      fetchItems={() => api.get<Clinic[]>('/api/clinics')}
      getLabel={clinicLabel}
      getSub={(c) => c.city.name}
      renderAdd={(a) => <ClinicForm initialName={a.initialName} onDone={a.onDone} onCancel={a.onCancel} />}
    />
  )
}

export function TreatmentTypeSelect({ label = 'Treatment', ...p }: SelectProps<Ref>) {
  return (
    <EntitySelect<Ref>
      {...p}
      label={label}
      noun="treatment type"
      queryKey={['treatment-types', { includeArchived: false }]}
      fetchItems={() => api.get('/api/treatment-types')}
      getLabel={(t) => t.name}
      renderAdd={(a) => <TreatmentTypeForm initialName={a.initialName} onDone={a.onDone} onCancel={a.onCancel} />}
    />
  )
}

/**
 * Doctors at one clinic; adding a doctor here links them to that clinic.
 * `allDoctors` lists every doctor instead, for linking an existing one.
 */
export function DoctorSelect({
  clinic,
  allDoctors = false,
  label = 'Clinic doctor',
  ...p
}: SelectProps<Ref> & { clinic: ClinicRef | null; allDoctors?: boolean }) {
  const clinicFilter = allDoctors ? null : (clinic?.id ?? null)
  return (
    <EntitySelect<Ref>
      {...p}
      label={label}
      noun="doctor"
      disabled={p.disabled || !clinic}
      disabledHint="Pick a clinic first"
      queryKey={['doctors', { clinicId: clinicFilter, includeArchived: false }]}
      fetchItems={() => api.get<Doctor[]>('/api/doctors', { clinic_id: clinicFilter })}
      getLabel={(d) => d.name}
      renderAdd={(a) => (
        <DoctorForm initialName={a.initialName} linkClinic={clinic} onDone={a.onDone} onCancel={a.onCancel} />
      )}
    />
  )
}

export function PatientSelect({ label = 'Patient', ...p }: SelectProps<Ref & { phone?: string | null }>) {
  return (
    <EntitySelect<Ref & { phone?: string | null }>
      {...p}
      label={label}
      noun="patient"
      serverSearch
      queryKey={['patients']}
      fetchItems={(q) => api.get<Patient[]>('/api/patients', { q, limit: 50 })}
      getLabel={(pt) => pt.name}
      getSub={(pt) => pt.phone ?? undefined}
      renderAdd={(a) => <PatientForm initialName={a.initialName} onDone={a.onDone} onCancel={a.onCancel} />}
    />
  )
}

export type CaseOption = { id: number; patient: Ref; treatment_type: Ref | null; status: string }

/** Existing cases at a clinic. Cases are created on the case form, not from here. */
export function CaseSelect({ clinic, label = 'Case', ...p }: SelectProps<CaseOption> & { clinic: ClinicRef | null }) {
  return (
    <EntitySelect<CaseOption>
      {...p}
      label={label}
      noun="case"
      serverSearch
      disabled={p.disabled || !clinic}
      disabledHint="Pick a clinic first"
      queryKey={['cases', 'select', clinic?.id ?? null]}
      fetchItems={async (q) =>
        (await api.get<CaseList>('/api/cases', { clinic_id: clinic?.id, q, limit: 50 })).items as Case[]
      }
      getLabel={(c) => c.patient.name}
      getSub={(c) => `${c.treatment_type?.name ?? 'Treatment not set'} · ${statusLabel(c.status)}`}
    />
  )
}
