import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, CASE_STATUSES, type CaseList } from '../api'
import { SearchIcon } from '../components/icons'
import { ErrorBox, Loading, Page } from '../components/Layout'
import { CaseRow, SummaryBar } from '../components/rows'
import { clinicLabel, statusLabel } from '../format'
import { useCities, useClinics } from '../queries'

export function CasesPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const status = params.get('status')
  const clinicId = params.get('clinic_id')
  const cityId = params.get('city_id')
  const incomplete = params.get('incomplete') === '1'

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setParams(
        (prev) => {
          const q = search.trim()
          if ((prev.get('q') ?? '') === q) return prev
          const next = new URLSearchParams(prev)
          if (q) next.set('q', q)
          else next.delete('q')
          return next
        },
        { replace: true },
      )
    }, 250)
    return () => clearTimeout(t)
  }, [search, setParams])

  const clinics = useClinics()
  const cities = useCities()
  const query = {
    q: params.get('q'),
    status,
    clinic_id: clinicId,
    city_id: cityId,
    incomplete: incomplete || undefined,
    limit: 300,
  }
  const cases = useQuery({
    queryKey: ['cases', query],
    queryFn: () => api.get<CaseList>('/api/cases', query),
    placeholderData: keepPreviousData,
  })

  return (
    <Page
      title="Cases"
      actions={
        <Link to="/cases/new" className="btn primary small">
          + New
        </Link>
      }
    >
      <div className="search">
        <SearchIcon />
        <input
          className="input"
          type="search"
          placeholder="Search patient or clinic"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="chips">
        <button
          className={`chip ${!status && !incomplete ? 'on' : ''}`}
          onClick={() => {
            const next = new URLSearchParams(params)
            next.delete('status')
            next.delete('incomplete')
            setParams(next, { replace: true })
          }}
        >
          All
        </button>
        {CASE_STATUSES.map((s) => (
          <button
            key={s}
            className={`chip ${status === s ? 'on' : ''}`}
            onClick={() => update('status', status === s ? null : s)}
          >
            {statusLabel(s)}
          </button>
        ))}
        <button
          className={`chip ${incomplete ? 'on' : ''}`}
          onClick={() => update('incomplete', incomplete ? null : '1')}
        >
          Missing details
        </button>
      </div>

      <div className="grid-2">
        <select className="select" value={cityId ?? ''} onChange={(e) => update('city_id', e.target.value || null)}>
          <option value="">All cities</option>
          {cities.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="select" value={clinicId ?? ''} onChange={(e) => update('clinic_id', e.target.value || null)}>
          <option value="">All clinics</option>
          {clinics.data
            ?.filter((c) => !cityId || String(c.city.id) === cityId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {clinicLabel(c)}
              </option>
            ))}
        </select>
      </div>

      <ErrorBox error={cases.error} />
      {cases.data && <SummaryBar sums={cases.data.sums} label="Cases" />}
      {cases.isLoading ? (
        <Loading />
      ) : (
        <div className="list">
          {cases.data?.items.length === 0 && (
            <div className="empty">
              No cases match. <Link to="/cases/new">Log a case</Link>
            </div>
          )}
          {cases.data?.items.map((c) => (
            <CaseRow key={c.id} c={c} showClinic={!clinicId} />
          ))}
        </div>
      )}
      {cases.data && cases.data.total > cases.data.items.length && (
        <div className="hint">
          Showing {cases.data.items.length} of {cases.data.total}. Narrow the search to see more.
        </div>
      )}
    </Page>
  )
}
