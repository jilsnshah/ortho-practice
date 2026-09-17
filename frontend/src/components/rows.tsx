import { Link } from 'react-router-dom'
import type { Appointment, Case, Totals } from '../api'
import { clinicWithCity, formatDate, formatMoney, formatTime, statusLabel } from '../format'

export const Badge = ({ status }: { status: string }) => (
  <span className={`badge ${status}`}>{statusLabel(status)}</span>
)

export function CaseRow({ c, showClinic = true }: { c: Case; showClinic?: boolean }) {
  return (
    <Link to={`/cases/${c.id}`} className="list-item">
      <span className="main">
        <div className="title">{c.patient.name}</div>
        <div className="sub">
          {c.treatment_type?.name ?? <span style={{ color: 'var(--warn)' }}>Treatment not set</span>}
          {showClinic && ` · ${clinicWithCity(c.clinic)}`}
        </div>
      </span>
      <span className="aside">
        <div className={`num ${c.profit < 0 ? 'negative' : ''}`}>{formatMoney(c.profit)}</div>
        <Badge status={c.status} />
      </span>
    </Link>
  )
}

export function AppointmentRow({ a, showDate = false }: { a: Appointment; showDate?: boolean }) {
  const who = a.patient?.name ?? 'Clinic visit'
  return (
    <Link to={`/appointments/${a.id}`} className="list-item">
      <span className="time-col">
        {formatTime(a.starts_at)}
        {showDate && <div className="hint">{formatDate(a.starts_at, { year: undefined, weekday: 'short' })}</div>}
      </span>
      <span className="main">
        <div className="title">{clinicWithCity(a.clinic)}</div>
        <div className="sub">
          {who}
          {a.case?.treatment_type && ` · ${a.case.treatment_type.name}`}
          {a.doctor && ` · with ${a.doctor.name}`}
        </div>
      </span>
      {a.status !== 'scheduled' && <Badge status={a.status} />}
    </Link>
  )
}

export function SummaryBar({ sums, label = 'cases' }: { sums: Totals; label?: string }) {
  return (
    <div className="summary-bar">
      <span>
        {label}
        <b>{sums.count}</b>
      </span>
      <span>
        Your fee
        <b>{formatMoney(sums.fee_amount)}</b>
      </span>
      <span>
        Material
        <b>{formatMoney(sums.material_cost)}</b>
      </span>
      <span>
        Profit
        <b className={sums.profit < 0 ? 'negative' : ''}>{formatMoney(sums.profit)}</b>
      </span>
    </div>
  )
}
