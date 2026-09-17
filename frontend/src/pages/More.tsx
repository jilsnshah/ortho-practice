import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type User } from '../api'
import { ErrorBox, Page } from '../components/Layout'
import { Sheet } from '../components/Sheet'

const LINKS = [
  { to: '/dashboard', title: 'Dashboard', sub: 'Earnings by clinic, city, month and treatment' },
  { to: '/directory/patients', title: 'Patients', sub: 'Search and edit patient records' },
  { to: '/directory/doctors', title: 'Doctors', sub: 'Clinic doctors and where they work' },
  { to: '/directory/treatment-types', title: 'Treatment types', sub: 'The treatments used on rate cards and cases' },
  { to: '/directory/cities', title: 'Cities', sub: 'Cities your clinics are in' },
]

export function MorePage() {
  const qc = useQueryClient()
  const me = useQuery<User>({ queryKey: ['me'] })
  const [changing, setChanging] = useState(false)

  const logout = async () => {
    await api.post('/api/auth/logout').catch(() => {})
    qc.setQueryData(['me'], null)
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
  }

  return (
    <Page title="More">
      <div className="list">
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="list-item">
            <span className="main">
              <div className="title">{l.title}</div>
              <div className="sub">{l.sub}</div>
            </span>
            <span className="muted">›</span>
          </Link>
        ))}
      </div>
      <div className="card stack">
        <div className="row">
          <span className="spacer">
            <div>{me.data?.full_name}</div>
            <div className="muted small">{me.data?.email}</div>
          </span>
          <button className="btn small" onClick={logout}>
            Sign out
          </button>
        </div>
        <button className="btn small" onClick={() => setChanging(true)}>
          Change password
        </button>
      </div>
      {changing && <PasswordSheet onClose={() => setChanging(false)} />}
    </Page>
  )
}

function PasswordSheet({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setBusy(true)
    setError(null)
    try {
      await api.post('/api/auth/password', { current_password: current, new_password: next })
      setDone(true)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Change password" onClose={onClose}>
      {done ? (
        <>
          <div className="notice">Password changed. Use the new one next time you sign in.</div>
          <button className="btn primary block" onClick={onClose}>
            Done
          </button>
        </>
      ) : (
        <form className="stack" onSubmit={submit}>
          <div className="field">
            <label htmlFor="cur-pw">Current password</label>
            <input
              id="cur-pw"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="new-pw">New password</label>
            <input
              id="new-pw"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              minLength={4}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <span className="hint">At least 4 characters.</span>
          </div>
          <ErrorBox error={error} />
          <div className="form-actions">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy}>
              {busy ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  )
}
