import { useState, type FormEvent, type ReactNode } from 'react'
import {
  ApiError,
  api,
  type City,
  type Clinic,
  type ClinicDetail,
  type ClinicRef,
  type Doctor,
  type Patient,
  type Ref,
  type TreatmentType,
} from '../api'
import { clinicLabel } from '../format'
import { useClinics, useInvalidateAll } from '../queries'
import { CitySelect } from './selects'

/** Shared submit plumbing: busy state, error capture, and portal-safe submit. */
function useSubmit() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const invalidate = useInvalidateAll()

  const run = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault()
    // Sheets render in portals; stop React bubbling the submit into an outer form.
    e.stopPropagation()
    setBusy(true)
    setError(null)
    try {
      await fn()
      await invalidate()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}

/**
 * Shown when the server refuses to create a second copy of an existing record.
 * The only ways forward are using the existing record or changing the input.
 */
function SubmitError({
  error,
  noun,
  onUseExisting,
  children,
}: {
  error: unknown
  noun: string
  onUseExisting?: (existing: Ref) => void
  children?: ReactNode
}) {
  if (!error) return null
  const existing = error instanceof ApiError && error.status === 409 ? error.existing : undefined
  return (
    <div className="error-box stack">
      <div>{error instanceof Error ? error.message : String(error)}</div>
      {existing && onUseExisting && (
        <button type="button" className="btn small" onClick={() => onUseExisting(existing)}>
          Use existing {noun} “{existing.name}”
        </button>
      )}
      {children}
    </div>
  )
}

function Actions({ busy, onCancel, label = 'Save' }: { busy: boolean; onCancel: () => void; label?: string }) {
  return (
    <div className="form-actions">
      <button type="button" className="btn" onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className="btn primary" disabled={busy}>
        {busy ? 'Saving…' : label}
      </button>
    </div>
  )
}

// ---- simple named records ------------------------------------------------

export function NameForm<T extends { id: number; name: string }>({
  endpoint,
  noun,
  initial,
  initialName = '',
  onDone,
  onCancel,
}: {
  endpoint: string
  noun: string
  initial?: T
  initialName?: string
  onDone: (item: T) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? initialName)
  const { busy, error, run } = useSubmit()

  return (
    <form
      className="stack"
      onSubmit={run(async () => {
        const saved = initial
          ? await api.patch<T>(`${endpoint}/${initial.id}`, { name })
          : await api.post<T>(endpoint, { name })
        onDone(saved)
      })}
    >
      <div className="field">
        <label htmlFor="nf-name">Name</label>
        <input
          id="nf-name"
          className="input"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <SubmitError
        error={error}
        noun={noun}
        onUseExisting={initial ? undefined : (existing) => onDone(existing as unknown as T)}
      />
      <Actions busy={busy} onCancel={onCancel} label={initial ? 'Save' : `Add ${noun}`} />
    </form>
  )
}

export const CityForm = (p: {
  initialName?: string
  initial?: City
  onDone: (c: City) => void
  onCancel: () => void
}) => <NameForm<City> endpoint="/api/cities" noun="city" {...p} />

export const TreatmentTypeForm = (p: {
  initialName?: string
  initial?: TreatmentType
  onDone: (t: TreatmentType) => void
  onCancel: () => void
}) => {
  // A duplicate hands back only {id, name}; archived flag is irrelevant for selection.
  return <NameForm<TreatmentType> endpoint="/api/treatment-types" noun="treatment type" {...p} />
}

// ---- clinic --------------------------------------------------------------

export function ClinicForm({
  initial,
  initialName = '',
  onDone,
  onCancel,
}: {
  initial?: ClinicDetail
  initialName?: string
  onDone: (clinic: ClinicDetail) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? initialName)
  const [branch, setBranch] = useState(initial?.branch ?? '')
  const [city, setCity] = useState<City | null>(initial?.city ?? null)
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const { busy, error, setError, run } = useSubmit()

  return (
    <form
      className="stack"
      onSubmit={run(async () => {
        if (!city) {
          setError(new Error('Select the city first (or add it).'))
          return
        }
        const body = { name, branch, city_id: city.id, phone, address, notes }
        const saved = initial
          ? await api.patch<ClinicDetail>(`/api/clinics/${initial.id}`, body)
          : await api.post<ClinicDetail>('/api/clinics', body)
        onDone(saved)
      })}
    >
      <div className="field">
        <label htmlFor="cf-name">Clinic name</label>
        <input
          id="cf-name"
          className="input"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="cf-branch">Branch / area (optional)</label>
        <input id="cf-branch" className="input" value={branch} onChange={(e) => setBranch(e.target.value)} />
      </div>
      <CitySelect value={city} onChange={setCity} />
      <div className="field">
        <label htmlFor="cf-phone">Phone</label>
        <input id="cf-phone" className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="cf-address">Address</label>
        <textarea
          id="cf-address"
          className="textarea"
          rows={2}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="cf-notes">Notes</label>
        <textarea
          id="cf-notes"
          className="textarea"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <SubmitError
        error={error}
        noun="clinic"
        onUseExisting={
          initial ? undefined : async (existing) => onDone(await api.get<ClinicDetail>(`/api/clinics/${existing.id}`))
        }
      />
      <Actions busy={busy} onCancel={onCancel} label={initial ? 'Save' : 'Add clinic'} />
    </form>
  )
}

// ---- doctor --------------------------------------------------------------

export function DoctorForm({
  initial,
  initialName = '',
  linkClinic,
  onDone,
  onCancel,
}: {
  initial?: Doctor
  initialName?: string
  /** When adding from a clinic context, the new doctor is linked to that clinic. */
  linkClinic?: ClinicRef | null
  onDone: (doctor: Doctor) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? initialName)
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [clinicIds, setClinicIds] = useState<number[]>(initial?.clinic_ids ?? (linkClinic ? [linkClinic.id] : []))
  const clinics = useClinics()
  const { busy, error, setError, run } = useSubmit()
  const invalidate = useInvalidateAll()

  const toggle = (id: number) => setClinicIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const useExisting = async (existing: Ref) => {
    try {
      if (linkClinic) await api.post(`/api/clinics/${linkClinic.id}/doctors`, { doctor_id: existing.id })
      const doctor = await api.get<Doctor>(`/api/doctors/${existing.id}`)
      await invalidate()
      onDone(doctor)
    } catch (err) {
      setError(err)
    }
  }

  return (
    <form
      className="stack"
      onSubmit={run(async () => {
        const body = { name, phone, email, notes, clinic_ids: clinicIds }
        const saved = initial
          ? await api.patch<Doctor>(`/api/doctors/${initial.id}`, body)
          : await api.post<Doctor>('/api/doctors', body)
        onDone(saved)
      })}
    >
      <div className="field">
        <label htmlFor="df-name">Doctor name</label>
        <input
          id="df-name"
          className="input"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <span className="hint">“Dr. Sharma”, “Dr Sharma” and “Sharma” are treated as the same doctor.</span>
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="df-phone">Phone</label>
          <input id="df-phone" className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="df-email">Email</label>
          <input
            id="df-email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <span className="label">Works at</span>
        {clinics.data?.length ? (
          <div className="stack" style={{ gap: 8 }}>
            {clinics.data.map((c: Clinic) => (
              <label key={c.id} className="check">
                <input type="checkbox" checked={clinicIds.includes(c.id)} onChange={() => toggle(c.id)} />
                <span>
                  {clinicLabel(c)} <span className="muted">· {c.city.name}</span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <span className="hint">No clinics yet.</span>
        )}
      </div>
      <div className="field">
        <label htmlFor="df-notes">Notes</label>
        <textarea
          id="df-notes"
          className="textarea"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <SubmitError error={error} noun="doctor" onUseExisting={initial ? undefined : useExisting} />
      <Actions busy={busy} onCancel={onCancel} label={initial ? 'Save' : 'Add doctor'} />
    </form>
  )
}

// ---- patient -------------------------------------------------------------

export function PatientForm({
  initial,
  initialName = '',
  onDone,
  onCancel,
}: {
  initial?: Patient
  initialName?: string
  onDone: (patient: Patient) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? initialName)
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const { busy, error, run } = useSubmit()

  const save = (allowDuplicate: boolean) => async () => {
    const saved = initial
      ? await api.patch<Patient>(`/api/patients/${initial.id}`, { name, phone, notes })
      : await api.post<Patient>('/api/patients', { name, phone, notes, allow_duplicate: allowDuplicate })
    onDone(saved)
  }

  const candidates =
    error instanceof ApiError && typeof error.detail === 'object' && !Array.isArray(error.detail)
      ? (error.detail.candidates ?? [])
      : []

  return (
    <form className="stack" onSubmit={run(save(false))}>
      <div className="field">
        <label htmlFor="pf-name">Patient name</label>
        <input
          id="pf-name"
          className="input"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="pf-phone">Phone</label>
        <input id="pf-phone" className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <span className="hint">Helps tell apart patients with the same name.</span>
      </div>
      <div className="field">
        <label htmlFor="pf-notes">Notes</label>
        <textarea
          id="pf-notes"
          className="textarea"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      {error instanceof ApiError && error.confirmable ? (
        <div className="notice stack">
          <div>{error.message}</div>
          {candidates.map((c) => (
            <button key={c.id} type="button" className="btn small" onClick={() => onDone(c)}>
              Use “{c.name}”{c.phone ? ` · ${c.phone}` : ''}
            </button>
          ))}
          <button type="button" className="btn small ghost" disabled={busy} onClick={run(save(true))}>
            No — this is a different person, add anyway
          </button>
        </div>
      ) : (
        <SubmitError error={error} noun="patient" />
      )}
      <Actions busy={busy} onCancel={onCancel} label={initial ? 'Save' : 'Add patient'} />
    </form>
  )
}
