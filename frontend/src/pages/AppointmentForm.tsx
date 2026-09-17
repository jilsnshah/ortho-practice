import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  api,
  APPOINTMENT_STATUSES,
  type Appointment,
  type AppointmentStatus,
  type Case,
  type ClinicRef,
  type Ref,
} from '../api'
import { ErrorBox, Loading, Page } from '../components/Layout'
import { CaseSelect, ClinicSelect, DoctorSelect, PatientSelect, type CaseOption } from '../components/selects'
import { isoDate, localDateTime, statusLabel } from '../format'
import { useInvalidateAll } from '../queries'

export function AppointmentFormPage() {
  const { id } = useParams()
  const existing = useQuery({
    queryKey: ['appointment', Number(id)],
    queryFn: () => api.get<Appointment>(`/api/appointments/${id}`),
    enabled: !!id,
  })
  if (id && !existing.data) {
    return (
      <Page title="Appointment" back>
        {existing.error ? <ErrorBox error={existing.error} /> : <Loading />}
      </Page>
    )
  }
  return <AppointmentForm initial={existing.data} />
}

function AppointmentForm({ initial }: { initial?: Appointment }) {
  const navigate = useNavigate()
  const invalidate = useInvalidateAll()
  const [params] = useSearchParams()

  const [clinic, setClinic] = useState<ClinicRef | null>(initial?.clinic ?? null)
  const [kase, setKase] = useState<CaseOption | null>(
    initial?.case && initial.patient ? { ...initial.case, patient: initial.patient } : null,
  )
  const [patient, setPatient] = useState<Ref | null>(initial?.patient ?? null)
  const [doctor, setDoctor] = useState<Ref | null>(initial?.doctor ?? null)
  const [date, setDate] = useState(initial?.starts_at.slice(0, 10) ?? params.get('date') ?? isoDate())
  const [time, setTime] = useState(initial?.starts_at.slice(11, 16) ?? '10:00')
  const [duration, setDuration] = useState(String(initial?.duration_minutes ?? 30))
  const [status, setStatus] = useState<AppointmentStatus>(initial?.status ?? 'scheduled')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  // Arriving from a case: the case fixes clinic and patient.
  useEffect(() => {
    const caseId = params.get('case_id')
    if (initial || !caseId) return
    api.get<Case>(`/api/cases/${caseId}`).then((c) => {
      setClinic(c.clinic)
      setKase(c)
      setPatient(c.patient)
      setDoctor(c.doctor)
    }, setError)
  }, [initial, params])

  const pickClinic = (c: ClinicRef | null) => {
    if (c?.id !== clinic?.id) {
      setKase(null)
      setDoctor(null)
    }
    setClinic(c)
  }
  const pickCase = (c: CaseOption | null) => {
    setKase(c)
    setPatient(c ? c.patient : null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!clinic) {
      setError(new Error('Select a clinic (or add one).'))
      return
    }
    setBusy(true)
    setError(null)
    const body = {
      clinic_id: clinic.id,
      case_id: kase?.id ?? null,
      patient_id: kase ? kase.patient.id : (patient?.id ?? null),
      doctor_id: doctor?.id ?? null,
      starts_at: localDateTime(date, time),
      duration_minutes: Number(duration) || 30,
      status,
      notes,
    }
    try {
      if (initial) await api.patch(`/api/appointments/${initial.id}`, body)
      else await api.post('/api/appointments', body)
      await invalidate()
      navigate(-1)
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!initial || !confirm('Delete this appointment?')) return
    try {
      await api.del(`/api/appointments/${initial.id}`)
      await invalidate()
      navigate(-1)
    } catch (err) {
      setError(err)
    }
  }

  const markDone = async () => {
    if (!initial) return
    try {
      await api.patch(`/api/appointments/${initial.id}`, { status: 'completed', notes })
      await invalidate()
      navigate(-1)
    } catch (err) {
      setError(err)
    }
  }

  return (
    <Page title={initial ? 'Appointment' : 'New appointment'} back>
      <form className="stack" onSubmit={submit}>
        <div className="columns">
          <div className="stack">
            <div className="card stack">
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="a-date">Date</label>
                  <input
                    id="a-date"
                    className="input"
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="a-time">Time</label>
                  <input
                    id="a-time"
                    className="input"
                    type="time"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </div>
              </div>
              <ClinicSelect value={clinic} onChange={pickClinic} />
              <CaseSelect
                clinic={clinic}
                value={kase}
                onChange={pickCase}
                clearable
                label="Case (optional)"
                hint={
                  clinic && !kase ? (
                    <>
                      New patient? Pick them below, or <Link to={`/cases/new?clinic_id=${clinic.id}`}>log a case</Link>.
                    </>
                  ) : undefined
                }
              />
              {!kase && <PatientSelect value={patient} onChange={setPatient} clearable label="Patient (optional)" />}
              <DoctorSelect clinic={clinic} value={doctor} onChange={setDoctor} clearable />
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="a-duration">Duration (min)</label>
                  <input
                    id="a-duration"
                    className="input"
                    type="number"
                    inputMode="numeric"
                    min={5}
                    step={5}
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="a-status">Status</label>
                  <select
                    id="a-status"
                    className="select"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
                  >
                    {APPOINTMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div className="stack">
            <div className="card field">
              <label htmlFor="a-notes">Notes from the discussion</label>
              <textarea
                id="a-notes"
                className="textarea"
                rows={5}
                placeholder="What was discussed with the clinic’s doctor, next steps…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        <ErrorBox error={error} />
        <div className="form-actions">
          {initial && (
            <button type="button" className="btn danger" onClick={remove}>
              Delete
            </button>
          )}
          <span className="spacer" />
          {initial?.status === 'scheduled' && (
            <button type="button" className="btn" onClick={markDone}>
              ✓ Mark done
            </button>
          )}
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
        {kase && (
          <Link to={`/cases/${kase.id}`} className="btn ghost block">
            Open case ›
          </Link>
        )}
      </form>
    </Page>
  )
}
