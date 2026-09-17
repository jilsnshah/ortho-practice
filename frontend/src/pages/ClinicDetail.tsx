import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type CaseList, type ClinicDetail, type RateCardEntry, type Ref } from '../api'
import { ClinicForm } from '../components/forms'
import { ErrorBox, Loading, Page } from '../components/Layout'
import { CaseRow, SummaryBar } from '../components/rows'
import { DoctorSelect, TreatmentTypeSelect } from '../components/selects'
import { Sheet } from '../components/Sheet'
import { clinicLabel, formatMoney } from '../format'
import { useInvalidateAll } from '../queries'

export function ClinicDetailPage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const invalidate = useInvalidateAll()
  const clinic = useQuery({ queryKey: ['clinic', id], queryFn: () => api.get<ClinicDetail>(`/api/clinics/${id}`) })
  const cases = useQuery({
    queryKey: ['cases', { clinic_id: id, limit: 20 }],
    queryFn: () => api.get<CaseList>('/api/cases', { clinic_id: id, limit: 20 }),
  })
  const [editing, setEditing] = useState(false)
  const [rateSheet, setRateSheet] = useState<RateCardEntry | 'new' | null>(null)
  const [linking, setLinking] = useState<Ref | null>(null)
  const [error, setError] = useState<unknown>(null)

  if (!clinic.data) {
    return (
      <Page title="Clinic" back>
        {clinic.error ? <ErrorBox error={clinic.error} /> : <Loading />}
      </Page>
    )
  }
  const c = clinic.data

  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      await invalidate()
    } catch (err) {
      setError(err)
    }
  }

  const linkDoctor = (doctor: Ref | null) => {
    setLinking(null)
    if (doctor && !c.doctors.some((d) => d.id === doctor.id)) {
      act(() => api.post(`/api/clinics/${id}/doctors`, { doctor_id: doctor.id }))
    }
  }

  const removeClinic = () => {
    if (!confirm(`Delete ${clinicLabel(c)}? Only possible if it has no cases or appointments.`)) return
    act(async () => {
      await api.del(`/api/clinics/${id}`)
      navigate('/clinics', { replace: true })
    })
  }

  return (
    <Page
      title={clinicLabel(c)}
      back
      actions={
        <button className="btn small" onClick={() => setEditing(true)}>
          Edit
        </button>
      }
    >
      <div className="columns">
        <div className="stack">
          <div className="card stack" style={{ gap: 6 }}>
            <div className="muted">
              {c.city.name}
              {c.is_archived && <span className="badge"> archived</span>}
            </div>
            {c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>}
            {c.address && <div style={{ whiteSpace: 'pre-wrap' }}>{c.address}</div>}
            {c.notes && (
              <div className="muted small" style={{ whiteSpace: 'pre-wrap' }}>
                {c.notes}
              </div>
            )}
          </div>

          <ErrorBox error={error} />

          <section>
            <div className="section-head">
              <h2>Rate card</h2>
              <button className="btn small" onClick={() => setRateSheet('new')}>
                + Treatment
              </button>
            </div>
            <div className="list">
              {c.rate_card.length === 0 && (
                <div className="empty">
                  No rates yet. Add each treatment’s usual quote, your fee and material cost at this clinic.
                </div>
              )}
              {c.rate_card.map((r) => (
                <button key={r.id} className="list-item" onClick={() => setRateSheet(r)}>
                  <span className="main">
                    <div className="title">{r.treatment_type.name}</div>
                    <div className="sub wrap">
                      Quote {formatMoney(r.quote_amount)} · fee {formatMoney(r.fee_amount)} · material{' '}
                      {formatMoney(r.material_cost)}
                    </div>
                  </span>
                  <span className="aside">
                    <div className="hint">Profit</div>
                    <b className="num">{formatMoney(r.profit)}</b>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="section-head">
              <h2>Doctors</h2>
            </div>
            <div className="list">
              {c.doctors.map((d) => (
                <div key={d.id} className="list-item">
                  <span className="main title">{d.name}</span>
                  <button
                    className="btn small ghost"
                    onClick={() =>
                      confirm(`Unlink ${d.name} from this clinic?`) &&
                      act(() => api.del(`/api/clinics/${id}/doctors/${d.id}`))
                    }
                  >
                    Unlink
                  </button>
                </div>
              ))}
              {c.doctors.length === 0 && <div className="empty">No doctors linked.</div>}
            </div>
            <div style={{ marginTop: 10 }}>
              <LinkDoctorPicker clinic={c} value={linking} onChange={linkDoctor} />
            </div>
          </section>
        </div>
        <div className="stack">
          <section className="stack">
            <div className="section-head" style={{ marginBottom: 0 }}>
              <h2>Cases here</h2>
              <Link to={`/cases/new?clinic_id=${id}`} className="btn small primary">
                + New case
              </Link>
            </div>
            {cases.data && <SummaryBar sums={cases.data.sums} label="Cases" />}
            <div className="list">
              {cases.data?.items.length === 0 && <div className="empty">No cases yet.</div>}
              {cases.data?.items.map((k) => (
                <CaseRow key={k.id} c={k} showClinic={false} />
              ))}
            </div>
            {cases.data && cases.data.total > cases.data.items.length && (
              <Link to={`/cases?clinic_id=${id}`} className="btn ghost block">
                All {cases.data.total} cases ›
              </Link>
            )}
          </section>
        </div>
      </div>

      <div className="row wrap">
        <button
          className="btn small"
          onClick={() => act(() => api.patch(`/api/clinics/${id}`, { is_archived: !c.is_archived }))}
        >
          {c.is_archived ? 'Unarchive clinic' : 'Archive clinic'}
        </button>
        <button className="btn small danger" onClick={removeClinic}>
          Delete clinic
        </button>
      </div>

      {editing && (
        <Sheet title="Edit clinic" onClose={() => setEditing(false)}>
          <ClinicForm initial={c} onCancel={() => setEditing(false)} onDone={() => setEditing(false)} />
        </Sheet>
      )}
      {rateSheet && (
        <RateSheet clinic={c} entry={rateSheet === 'new' ? null : rateSheet} onClose={() => setRateSheet(null)} />
      )}
    </Page>
  )
}

/** Picking an existing doctor links them; "Add new" creates and links in one step. */
function LinkDoctorPicker({
  clinic,
  value,
  onChange,
}: {
  clinic: ClinicDetail
  value: Ref | null
  onChange: (d: Ref | null) => void
}) {
  return <DoctorSelect clinic={clinic} value={value} onChange={onChange} label="Link a doctor" allDoctors />
}

function RateSheet({
  clinic,
  entry,
  onClose,
}: {
  clinic: ClinicDetail
  entry: RateCardEntry | null
  onClose: () => void
}) {
  const invalidate = useInvalidateAll()
  const [treatment, setTreatment] = useState<Ref | null>(entry?.treatment_type ?? null)
  const [quote, setQuote] = useState(entry ? String(entry.quote_amount) : '')
  const [fee, setFee] = useState(entry ? String(entry.fee_amount) : '')
  const [material, setMaterial] = useState(entry ? String(entry.material_cost) : '')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const n = (s: string) => Math.max(0, Math.round(Number(s)) || 0)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!treatment) {
      setError(new Error('Select a treatment type (or add one).'))
      return
    }
    setBusy(true)
    setError(null)
    const money = { quote_amount: n(quote), fee_amount: n(fee), material_cost: n(material) }
    try {
      if (entry) await api.patch(`/api/clinics/${clinic.id}/rate-card/${entry.id}`, money)
      else await api.post(`/api/clinics/${clinic.id}/rate-card`, { treatment_type_id: treatment.id, ...money })
      await invalidate()
      onClose()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  const remove = async () => {
    if (
      !entry ||
      !confirm(`Remove ${entry.treatment_type.name} from this rate card? Existing cases keep their amounts.`)
    )
      return
    try {
      await api.del(`/api/clinics/${clinic.id}/rate-card/${entry.id}`)
      await invalidate()
      onClose()
    } catch (err) {
      setError(err)
    }
  }

  const fields: [string, string, (v: string) => void][] = [
    ['Patient quote', quote, setQuote],
    ['Your fee', fee, setFee],
    ['Material cost', material, setMaterial],
  ]

  return (
    <Sheet title={entry ? `${entry.treatment_type.name} rate` : 'Add treatment rate'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {entry ? (
          <div className="muted">{clinicLabel(clinic)}</div>
        ) : (
          <TreatmentTypeSelect value={treatment} onChange={setTreatment} />
        )}
        {fields.map(([label, value, set], i) => (
          <div className="field" key={label}>
            <label htmlFor={`rate-${i}`}>{label}</label>
            <input
              id={`rate-${i}`}
              className="input num"
              type="number"
              inputMode="numeric"
              min={0}
              value={value}
              placeholder="0"
              onChange={(e) => set(e.target.value)}
            />
          </div>
        ))}
        <div className="profit-line">
          <span>Profit</span>
          <span className="v">{formatMoney(n(fee) - n(material))}</span>
        </div>
        <ErrorBox error={error} />
        <div className="form-actions">
          {entry && (
            <button type="button" className="btn danger" onClick={remove}>
              Remove
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            Save
          </button>
        </div>
      </form>
    </Sheet>
  )
}
