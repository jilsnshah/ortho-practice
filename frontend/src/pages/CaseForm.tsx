import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  api,
  CASE_STATUSES,
  type Case,
  type CaseStatus,
  type ClinicDetail,
  type ClinicRef,
  type Money,
  type RateCardEntry,
  type Ref,
} from '../api'
import { ErrorBox, Loading, Page } from '../components/Layout'
import { ClinicSelect, DoctorSelect, PatientSelect, TreatmentTypeSelect } from '../components/selects'
import { clinicLabel, formatMoney, isoDate, statusLabel } from '../format'
import { useInvalidateAll } from '../queries'

type Amounts = { quote_amount: string; fee_amount: string; material_cost: string }
const AMOUNT_FIELDS = [
  ['quote_amount', 'Patient quote'],
  ['fee_amount', 'Your fee'],
  ['material_cost', 'Material cost'],
] as const

const toAmounts = (m: Money): Amounts => ({
  quote_amount: String(m.quote_amount),
  fee_amount: String(m.fee_amount),
  material_cost: String(m.material_cost),
})
const num = (s: string) => (s.trim() === '' ? 0 : Math.max(0, Math.round(Number(s)) || 0))
const sameAsRate = (a: Amounts, r: RateCardEntry) =>
  num(a.quote_amount) === r.quote_amount &&
  num(a.fee_amount) === r.fee_amount &&
  num(a.material_cost) === r.material_cost

export function CaseFormPage() {
  const { id } = useParams()
  const existing = useQuery({
    queryKey: ['case', Number(id)],
    queryFn: () => api.get<Case>(`/api/cases/${id}`),
    enabled: !!id,
  })
  if (id && !existing.data) {
    return (
      <Page title="Edit case" back>
        {existing.error ? <ErrorBox error={existing.error} /> : <Loading />}
      </Page>
    )
  }
  return <CaseForm initial={existing.data} />
}

function CaseForm({ initial }: { initial?: Case }) {
  const navigate = useNavigate()
  const invalidate = useInvalidateAll()
  const qc = useQueryClient()
  const [params] = useSearchParams()

  const [patient, setPatient] = useState<Ref | null>(initial?.patient ?? null)
  const [clinic, setClinic] = useState<ClinicRef | null>(initial?.clinic ?? null)
  const [treatment, setTreatment] = useState<Ref | null>(initial?.treatment_type ?? null)
  const [doctor, setDoctor] = useState<Ref | null>(initial?.doctor ?? null)
  const [status, setStatus] = useState<CaseStatus>(initial?.status ?? 'active')
  const [startedOn, setStartedOn] = useState(initial?.started_on ?? isoDate())
  const [amounts, setAmounts] = useState<Amounts>(
    initial ? toAmounts(initial) : { quote_amount: '', fee_amount: '', material_cost: '' },
  )
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saveRate, setSaveRate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  // Prefill clinic when arriving from a clinic page.
  useEffect(() => {
    const clinicId = params.get('clinic_id')
    if (!initial && clinicId) {
      api.get<ClinicDetail>(`/api/clinics/${clinicId}`).then((c) => setClinic((cur) => cur ?? c), setError)
    }
  }, [initial, params])

  const rateQuery = (clinicId: number, treatmentId: number) => ({
    queryKey: ['rate', clinicId, treatmentId],
    queryFn: () => api.get<RateCardEntry | null>(`/api/clinics/${clinicId}/rate-card/by-treatment/${treatmentId}`),
  })
  const rate = useQuery({ ...rateQuery(clinic?.id ?? 0, treatment?.id ?? 0), enabled: !!clinic && !!treatment })
  const rateEntry = clinic && treatment ? rate.data : undefined

  // Amounts last filled from a rate card, so switching to a treatment without
  // a rate clears them instead of silently carrying the old treatment's prices.
  const lastApplied = useRef<RateCardEntry | null>(null)
  const pickSeq = useRef(0)

  // Rate-card defaults apply only when the user picks a clinic/treatment,
  // never on first load of an existing case (its amounts are the record).
  const applyRate = async (c: ClinicRef | null, t: Ref | null) => {
    if (!c || !t) return
    const seq = ++pickSeq.current
    let entry: RateCardEntry | null
    try {
      entry = await qc.fetchQuery(rateQuery(c.id, t.id))
    } catch (err) {
      setError(err)
      return
    }
    if (seq !== pickSeq.current) return // a newer pick superseded this one
    if (entry) {
      setAmounts(toAmounts(entry))
      lastApplied.current = entry
      setSaveRate(false)
    } else {
      const stale = lastApplied.current
      if (stale) setAmounts((a) => (sameAsRate(a, stale) ? { quote_amount: '', fee_amount: '', material_cost: '' } : a))
      lastApplied.current = null
      // New treatment at this clinic: offer to remember whatever gets entered.
      setSaveRate(true)
    }
  }

  const pickClinic = (c: ClinicRef | null) => {
    if (c?.id === clinic?.id) return
    setClinic(c)
    setDoctor(null)
    applyRate(c, treatment)
  }
  const pickTreatment = (t: Ref | null) => {
    if (t?.id === treatment?.id) return
    setTreatment(t)
    applyRate(clinic, t)
  }

  const profit = num(amounts.fee_amount) - num(amounts.material_cost)
  const differs = rateEntry ? !sameAsRate(amounts, rateEntry) : false

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!patient || !clinic) {
      setError(new Error(!patient ? 'Select a patient (or add one).' : 'Select a clinic (or add one).'))
      return
    }
    setBusy(true)
    setError(null)
    const money = {
      quote_amount: num(amounts.quote_amount),
      fee_amount: num(amounts.fee_amount),
      material_cost: num(amounts.material_cost),
    }
    const body = {
      patient_id: patient.id,
      clinic_id: clinic.id,
      treatment_type_id: treatment?.id ?? null,
      doctor_id: doctor?.id ?? null,
      status,
      started_on: startedOn,
      notes,
      ...money,
    }
    try {
      const saved = initial
        ? await api.patch<Case>(`/api/cases/${initial.id}`, body)
        : await api.post<Case>('/api/cases', body)
      if (saveRate && treatment) {
        if (rateEntry) await api.patch(`/api/clinics/${clinic.id}/rate-card/${rateEntry.id}`, money)
        else if (rateEntry === null)
          await api.post(`/api/clinics/${clinic.id}/rate-card`, { treatment_type_id: treatment.id, ...money })
      }
      await invalidate()
      navigate(`/cases/${saved.id}`, { replace: true })
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!initial || !confirm(`Delete this case for ${initial.patient.name}? Photos will be deleted too.`)) return
    try {
      await api.del(`/api/cases/${initial.id}`)
      await invalidate()
      navigate('/cases', { replace: true })
    } catch (err) {
      setError(err)
    }
  }

  return (
    <Page title={initial ? 'Edit case' : 'New case'} back>
      <form className="stack" onSubmit={submit}>
        <div className="columns">
          <div className="stack">
            <div className="card stack">
              <PatientSelect value={patient} onChange={setPatient} />
              <ClinicSelect value={clinic} onChange={pickClinic} />
              <TreatmentTypeSelect
                value={treatment}
                onChange={pickTreatment}
                clearable
                hint={
                  !treatment
                    ? 'Leave empty if the plan isn’t decided yet — the case will show as “missing details”.'
                    : undefined
                }
              />
              <DoctorSelect clinic={clinic} value={doctor} onChange={setDoctor} clearable />
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="status">Status</label>
                  <select
                    id="status"
                    className="select"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as CaseStatus)}
                  >
                    {CASE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="started">Started</label>
                  <input
                    id="started"
                    className="input"
                    type="date"
                    required
                    value={startedOn}
                    onChange={(e) => setStartedOn(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="stack">
            <div className="card stack">
              <h2>Fees</h2>
              {AMOUNT_FIELDS.map(([field, label]) => (
                <div className="field" key={field}>
                  <label htmlFor={field}>{label}</label>
                  <input
                    id={field}
                    className="input num"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    placeholder="0"
                    value={amounts[field]}
                    onChange={(e) => setAmounts((a) => ({ ...a, [field]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="profit-line">
                <span>Profit (fee − material)</span>
                <span className={`v ${profit < 0 ? 'negative' : ''}`}>{formatMoney(profit)}</span>
              </div>

              {clinic && treatment && rate.isFetching && <div className="hint">Checking rate card…</div>}
              {rateEntry && !differs && (
                <div className="hint">
                  ✓ Matches the {clinicLabel(clinic!)} rate card for {treatment!.name}.
                </div>
              )}
              {rateEntry && differs && (
                <div className="notice stack" style={{ gap: 8 }}>
                  <div>
                    Differs from rate card: quote {formatMoney(rateEntry.quote_amount)}, fee{' '}
                    {formatMoney(rateEntry.fee_amount)}, material {formatMoney(rateEntry.material_cost)}.
                  </div>
                  <div className="row wrap">
                    <button type="button" className="btn small" onClick={() => setAmounts(toAmounts(rateEntry))}>
                      Use rate card
                    </button>
                    <label className="check">
                      <input type="checkbox" checked={saveRate} onChange={(e) => setSaveRate(e.target.checked)} />
                      Update the clinic’s rate card to these amounts
                    </label>
                  </div>
                </div>
              )}
              {rateEntry === null && !rate.isFetching && (
                <label className="check">
                  <input type="checkbox" checked={saveRate} onChange={(e) => setSaveRate(e.target.checked)} />
                  <span>
                    Save as {clinicLabel(clinic!)}’s default rate for {treatment!.name}
                    <div className="hint">Next time, these amounts fill in automatically.</div>
                  </span>
                </label>
              )}
            </div>

            <div className="card field">
              <label htmlFor="notes">Notes</label>
              <textarea id="notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
          <button type="button" className="btn" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : initial ? 'Save' : 'Save case'}
          </button>
        </div>
      </form>
    </Page>
  )
}
