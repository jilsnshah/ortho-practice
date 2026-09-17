import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, type Appointment, type Dashboard, type User } from '../api'
import { ErrorBox, Loading, Page } from '../components/Layout'
import { AppointmentRow } from '../components/rows'
import { addDays, formatDate, formatMoney, isoDate } from '../format'

export function TodayPage() {
  const today = isoDate()
  const weekEnd = isoDate(addDays(new Date(), 7))
  const monthStart = today.slice(0, 8) + '01'

  const me = useQuery<User>({ queryKey: ['me'] })
  const appts = useQuery({
    queryKey: ['appointments', { from: today, to: weekEnd }],
    queryFn: () => api.get<Appointment[]>('/api/appointments', { from: today, to: weekEnd }),
  })
  const month = useQuery({
    queryKey: ['dashboard', { from: monthStart, today }],
    queryFn: () => api.get<Dashboard>('/api/dashboard', { from: monthStart, today }),
  })

  const todays = appts.data?.filter((a) => a.starts_at.startsWith(today)) ?? []
  const upcoming = appts.data?.filter((a) => !a.starts_at.startsWith(today) && a.status === 'scheduled') ?? []
  const firstName = me.data?.full_name.replace(/^dr\.?\s+/i, '').split(' ')[0]

  return (
    <Page title={formatDate(new Date(), { weekday: 'long', year: undefined })}>
      {firstName && <h2 style={{ fontSize: '1.3rem' }}>Hello, Dr. {firstName}</h2>}

      <div className="grid-2 quick-actions">
        <Link to="/cases/new" className="btn primary">
          + New case
        </Link>
        <Link to={`/appointments/new?date=${today}`} className="btn">
          + Appointment
        </Link>
      </div>

      {!!month.data?.incomplete_case_count && (
        <Link to="/cases?incomplete=1" className="notice row">
          <span className="spacer">
            <b>{month.data.incomplete_case_count}</b> case{month.data.incomplete_case_count > 1 ? 's' : ''} still
            missing treatment or fee
          </span>
          <span>Review ›</span>
        </Link>
      )}

      <div className="columns">
        <div className="stack">
          <section>
            <div className="section-head">
              <h2>Today</h2>
              <Link to="/agenda" className="small">
                Full agenda ›
              </Link>
            </div>
            <ErrorBox error={appts.error} />
            {appts.isLoading ? (
              <Loading />
            ) : (
              <div className="list">
                {todays.length === 0 && <div className="empty">Nothing scheduled today.</div>}
                {todays.map((a) => (
                  <AppointmentRow key={a.id} a={a} />
                ))}
              </div>
            )}
          </section>
        </div>
        <div className="stack">
          {upcoming.length > 0 && (
            <section>
              <div className="section-head">
                <h2>Next 7 days</h2>
              </div>
              <div className="list">
                {upcoming.slice(0, 8).map((a) => (
                  <AppointmentRow key={a.id} a={a} showDate />
                ))}
              </div>
            </section>
          )}

          {month.data && (
            <Link to="/dashboard" className="card stack" style={{ color: 'inherit', gap: 8 }}>
              <div className="row">
                <h2 className="spacer" style={{ fontSize: '1rem' }}>
                  This month
                </h2>
                <span className="small" style={{ color: 'var(--primary)' }}>
                  Dashboard ›
                </span>
              </div>
              <div className="grid-3">
                <div className="tile">
                  <div className="k">New cases</div>
                  <div className="v">{month.data.totals.count}</div>
                </div>
                <div className="tile">
                  <div className="k">Your fee</div>
                  <div className="v">{formatMoney(month.data.totals.fee_amount)}</div>
                </div>
                <div className="tile accent">
                  <div className="k">Profit</div>
                  <div className="v">{formatMoney(month.data.totals.profit)}</div>
                </div>
              </div>
            </Link>
          )}
        </div>
      </div>
    </Page>
  )
}
