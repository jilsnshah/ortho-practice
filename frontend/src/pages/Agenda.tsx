import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type Appointment } from '../api'
import { ErrorBox, Loading, Page } from '../components/Layout'
import { AppointmentRow } from '../components/rows'
import { addDays, formatDate, isoDate, parseDate, startOfWeek } from '../format'

export function AgendaPage() {
  const [params, setParams] = useSearchParams()
  const weekStart = startOfWeek(params.get('week') ? parseDate(params.get('week')!) : new Date())
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const from = isoDate(days[0])
  const to = isoDate(days[6])
  const today = isoDate()

  const appts = useQuery({
    queryKey: ['appointments', { from, to }],
    queryFn: () => api.get<Appointment[]>('/api/appointments', { from, to }),
    placeholderData: keepPreviousData,
  })

  const go = (weeks: number) => setParams({ week: isoDate(addDays(weekStart, weeks * 7)) }, { replace: true })
  const isThisWeek = from === isoDate(startOfWeek(new Date()))

  return (
    <Page
      title="Agenda"
      actions={
        <Link to={`/appointments/new?date=${isThisWeek ? today : from}`} className="btn primary small">
          + New
        </Link>
      }
    >
      <div className="row">
        <button className="btn small" onClick={() => go(-1)} aria-label="Previous week">
          ‹
        </button>
        <b className="spacer" style={{ textAlign: 'center' }}>
          {formatDate(days[0], { year: undefined })} – {formatDate(days[6])}
        </b>
        <button className="btn small" onClick={() => go(1)} aria-label="Next week">
          ›
        </button>
        {!isThisWeek && (
          <button className="btn small ghost" onClick={() => setParams({}, { replace: true })}>
            Today
          </button>
        )}
      </div>

      <ErrorBox error={appts.error} />
      {appts.isLoading && <Loading />}

      {appts.data &&
        days.map((d) => {
          const key = isoDate(d)
          const items = appts.data.filter((a) => a.starts_at.startsWith(key))
          const clinics = new Set(items.filter((a) => a.status !== 'cancelled').map((a) => a.clinic.id)).size
          return (
            <section key={key} className="stack" style={{ gap: 10 }}>
              <div className={`day-head ${key === today ? 'today' : ''}`}>
                <h3>
                  {d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
                  {key === today && ' · Today'}
                </h3>
                <Link to={`/appointments/new?date=${key}`} className="small">
                  + Add
                </Link>
              </div>
              {items.length > 0 ? (
                <div className="list">
                  {items.map((a) => (
                    <AppointmentRow key={a.id} a={a} />
                  ))}
                </div>
              ) : (
                <div className="hint" style={{ paddingLeft: 4 }}>
                  Free
                </div>
              )}
              {clinics > 1 && (
                <div className="hint" style={{ paddingLeft: 4 }}>
                  {clinics} clinics this day
                </div>
              )}
            </section>
          )
        })}
    </Page>
  )
}
