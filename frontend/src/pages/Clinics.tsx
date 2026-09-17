import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Clinic } from '../api'
import { ClinicForm } from '../components/forms'
import { ErrorBox, Loading, Page } from '../components/Layout'
import { Sheet } from '../components/Sheet'
import { useClinics } from '../queries'

export function ClinicsPage() {
  const navigate = useNavigate()
  const [showArchived, setShowArchived] = useState(false)
  const [adding, setAdding] = useState(false)
  const clinics = useClinics(showArchived)

  const byCity = new Map<string, Clinic[]>()
  for (const c of clinics.data ?? []) {
    byCity.set(c.city.name, [...(byCity.get(c.city.name) ?? []), c])
  }

  return (
    <Page
      title="Clinics"
      actions={
        <button className="btn primary small" onClick={() => setAdding(true)}>
          + Add
        </button>
      }
    >
      <ErrorBox error={clinics.error} />
      {clinics.isLoading && <Loading />}
      {clinics.data?.length === 0 && (
        <div className="card empty">
          No clinics yet. Add each clinic you consult at, then set up its rate card so new cases fill in automatically.
        </div>
      )}
      {[...byCity.entries()].map(([city, list]) => (
        <section key={city} className="stack" style={{ gap: 10 }}>
          <div className="group-label">{city}</div>
          <div className="list">
            {list.map((c) => (
              <Link key={c.id} to={`/clinics/${c.id}`} className="list-item">
                <span className="main">
                  <div className="title">
                    {c.name}
                    {c.is_archived && <span className="badge"> archived</span>}
                  </div>
                  {(c.branch || c.phone) && (
                    <div className="sub">{[c.branch, c.phone].filter(Boolean).join(' · ')}</div>
                  )}
                </span>
                <span className="muted">›</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
      <label className="check small muted">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Show archived clinics
      </label>

      {adding && (
        <Sheet title="New clinic" onClose={() => setAdding(false)}>
          <ClinicForm onCancel={() => setAdding(false)} onDone={(c) => navigate(`/clinics/${c.id}`)} />
        </Sheet>
      )}
    </Page>
  )
}
