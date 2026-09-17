import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Dashboard, type GroupTotals } from '../api'
import { ErrorBox, Loading, Page } from '../components/Layout'
import { formatCompact, formatMoney, isoDate } from '../format'

type Metric = 'profit' | 'fee_amount' | 'quote_amount'
const METRICS: [Metric, string][] = [
  ['profit', 'Profit'],
  ['fee_amount', 'Your fee'],
  ['quote_amount', 'Patient quote'],
]

type Breakdown = 'by_clinic' | 'by_city' | 'by_treatment_type' | 'by_month'
const BREAKDOWNS: [Breakdown, string][] = [
  ['by_clinic', 'Clinic'],
  ['by_city', 'City'],
  ['by_treatment_type', 'Treatment'],
  ['by_month', 'Month'],
]

function periods(): { key: string; label: string; from?: string; to?: string }[] {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  return [
    { key: 'month', label: 'This month', from: isoDate(new Date(y, m, 1)) },
    { key: 'last', label: 'Last month', from: isoDate(new Date(y, m - 1, 1)), to: isoDate(new Date(y, m, 0)) },
    { key: 'quarter', label: 'Last 3 months', from: isoDate(new Date(y, m - 2, 1)) },
    { key: 'year', label: 'This year', from: isoDate(new Date(y, 0, 1)) },
    { key: 'all', label: 'All time' },
  ]
}

export function DashboardPage() {
  const options = periods()
  const [periodKey, setPeriodKey] = useState('year')
  const [metric, setMetric] = useState<Metric>('profit')
  const [breakdown, setBreakdown] = useState<Breakdown>('by_clinic')
  const period = options.find((p) => p.key === periodKey)!

  const query = { from: period.from, to: period.to, today: isoDate() }
  const dash = useQuery({
    queryKey: ['dashboard', query],
    queryFn: () => api.get<Dashboard>('/api/dashboard', query),
    placeholderData: keepPreviousData,
  })
  const d = dash.data
  const metricLabel = METRICS.find(([k]) => k === metric)![1]

  return (
    <Page title="Dashboard" back>
      <div className="chips" role="group" aria-label="Period">
        {options.map((p) => (
          <button key={p.key} className={`chip ${p.key === periodKey ? 'on' : ''}`} onClick={() => setPeriodKey(p.key)}>
            {p.label}
          </button>
        ))}
      </div>

      <ErrorBox error={dash.error} />
      {!d ? (
        dash.isLoading && <Loading />
      ) : (
        <>
          <div className="columns">
            <div className="stack">
              <div className="card">
                <div className="muted small">Profit · {period.label.toLowerCase()}</div>
                <div className={`hero-figure ${d.totals.profit < 0 ? 'negative' : ''}`}>
                  {formatMoney(d.totals.profit)}
                </div>
                <div className="muted small">
                  Your fee minus material cost, across {d.totals.count} case{d.totals.count === 1 ? '' : 's'} (by start
                  date)
                </div>
              </div>
            </div>
            <div className="stack">
              <div className="money-grid">
                <div className="tile">
                  <div className="k">Cases</div>
                  <div className="v">{d.totals.count.toLocaleString('en-IN')}</div>
                </div>
                <div className="tile">
                  <div className="k">Patient quotes</div>
                  <div className="v">{formatCompact(d.totals.quote_amount)}</div>
                </div>
                <div className="tile">
                  <div className="k">Your fee</div>
                  <div className="v">{formatCompact(d.totals.fee_amount)}</div>
                </div>
                <div className="tile">
                  <div className="k">Material</div>
                  <div className="v">{formatCompact(d.totals.material_cost)}</div>
                </div>
              </div>
            </div>
          </div>

          {d.incomplete_case_count > 0 && (
            <Link to="/cases?incomplete=1" className="notice row">
              <span className="spacer">
                {d.incomplete_case_count} case{d.incomplete_case_count > 1 ? 's are' : ' is'} missing treatment or fee —
                totals may be understated.
              </span>
              <span>Fix ›</span>
            </Link>
          )}

          <div className="chips" role="group" aria-label="Measure">
            {METRICS.map(([k, label]) => (
              <button key={k} className={`chip ${metric === k ? 'on' : ''}`} onClick={() => setMetric(k)}>
                {label}
              </button>
            ))}
          </div>

          {/* Side by side on a laptop, but only when there is a month chart to pair with. */}
          <div className={d.by_month.length > 1 ? 'columns' : 'stack'}>
            {d.by_month.length > 1 && (
              <div className="stack">
                <MonthColumns groups={d.by_month} metric={metric} metricLabel={metricLabel} />
              </div>
            )}
            <div className="stack">
              <section className="card">
                <div className="section-head">
                  <h2>{metricLabel} by</h2>
                </div>
                <div className="chips" role="tablist" style={{ marginBottom: 6 }}>
                  {BREAKDOWNS.map(([k, label]) => (
                    <button
                      key={k}
                      role="tab"
                      aria-selected={breakdown === k}
                      className={`chip ${breakdown === k ? 'on' : ''}`}
                      onClick={() => setBreakdown(k)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <RankedBars groups={d[breakdown]} metric={metric} sortByValue={breakdown !== 'by_month'} />
              </section>
            </div>
          </div>
        </>
      )}
    </Page>
  )
}

/** Ranked horizontal bars; every row states its values in text, so it doubles as the table view. */
function RankedBars({ groups, metric, sortByValue }: { groups: GroupTotals[]; metric: Metric; sortByValue: boolean }) {
  if (groups.length === 0) return <div className="empty">No cases in this period.</div>
  const rows = sortByValue ? [...groups].sort((a, b) => b[metric] - a[metric]) : groups
  const max = Math.max(1, ...rows.map((g) => g[metric]))
  return (
    <div>
      {rows.map((g) => (
        <div key={g.key} className="bar-row">
          <span className="name">
            {g.key.startsWith('clinic:') && g.id ? <Link to={`/clinics/${g.id}`}>{g.label}</Link> : g.label}
          </span>
          <span className={`num ${g[metric] < 0 ? 'negative' : ''}`}>{formatMoney(g[metric])}</span>
          <div className="bar-track" aria-hidden>
            <div className="bar-fill" style={{ width: `${(Math.max(0, g[metric]) / max) * 100}%` }} />
          </div>
          <span className="detail">
            {g.count} case{g.count === 1 ? '' : 's'} · fee {formatMoney(g.fee_amount)} · material{' '}
            {formatMoney(g.material_cost)} · profit {formatMoney(g.profit)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Change over time: one column per month, readout on hover or tap. */
function MonthColumns({ groups, metric, metricLabel }: { groups: GroupTotals[]; metric: Metric; metricLabel: string }) {
  const recent = groups.slice(-12)
  const [active, setActive] = useState<number>(recent.length - 1)
  const max = Math.max(1, ...recent.map((g) => g[metric]))
  const shown = recent[Math.min(active, recent.length - 1)]

  return (
    <section className="card">
      <div className="section-head" style={{ marginBottom: 4 }}>
        <h2>{metricLabel} by month</h2>
      </div>
      <div className="col-readout" aria-live="polite">
        <b>{shown.label}</b> · <span className="num">{formatMoney(shown[metric])}</span>
        <span className="muted">
          {' '}
          · {shown.count} case{shown.count === 1 ? '' : 's'}
        </span>
      </div>
      <div className="col-chart" role="img" aria-label={`${metricLabel} by month`}>
        {recent.map((g, i) => (
          <button
            key={g.key}
            type="button"
            className={`col ${i === active ? 'active' : ''}`}
            onPointerEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            aria-label={`${g.label}: ${formatMoney(g[metric])}`}
          >
            <span className="col-bar" style={{ height: `${(Math.max(0, g[metric]) / max) * 100}%` }} />
          </button>
        ))}
      </div>
      <div className="col-axis">
        {recent.map((g) => (
          <span key={g.key}>{g.label.slice(0, 3)}</span>
        ))}
      </div>
      <div className="hint">Peak {formatMoney(max)}. Exact figures: “Month” breakdown below.</div>
    </section>
  )
}
