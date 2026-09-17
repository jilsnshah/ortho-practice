import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { Route, Routes } from 'react-router-dom'
import { api, ApiError, UNAUTHORIZED_EVENT, type User } from './api'
import { Layout, Loading } from './components/Layout'
import { AgendaPage } from './pages/Agenda'
import { AppointmentFormPage } from './pages/AppointmentForm'
import { CaseDetailPage } from './pages/CaseDetail'
import { CaseFormPage } from './pages/CaseForm'
import { CasesPage } from './pages/Cases'
import { ClinicDetailPage } from './pages/ClinicDetail'
import { ClinicsPage } from './pages/Clinics'
import { DashboardPage } from './pages/Dashboard'
import { DirectoryPage } from './pages/Directory'
import { MorePage } from './pages/More'
import { PresentPage } from './pages/Present'
import { TodayPage } from './pages/Today'

export function App() {
  const qc = useQueryClient()
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<User>('/api/auth/me'),
    retry: false,
    staleTime: Infinity,
  })

  useEffect(() => {
    const onUnauthorized = () => qc.setQueryData(['me'], null)
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [qc])

  if (me.isLoading) return <Loading />
  if (!me.data) return <Login />

  return (
    <Routes>
      <Route path="/cases/:id/present" element={<PresentPage />} />
      <Route element={<Layout />}>
        <Route index element={<TodayPage />} />
        <Route path="cases" element={<CasesPage />} />
        <Route path="cases/new" element={<CaseFormPage />} />
        <Route path="cases/:id" element={<CaseDetailPage />} />
        <Route path="cases/:id/edit" element={<CaseFormPage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="appointments/new" element={<AppointmentFormPage />} />
        <Route path="appointments/:id" element={<AppointmentFormPage />} />
        <Route path="clinics" element={<ClinicsPage />} />
        <Route path="clinics/:id" element={<ClinicDetailPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="directory/:kind" element={<DirectoryPage />} />
        <Route path="more" element={<MorePage />} />
        <Route path="*" element={<TodayPage />} />
      </Route>
    </Routes>
  )
}

function Login() {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const user = await api.post<User>('/api/auth/login', { email, password })
      // Drop the previous session's data, but keep the observed ['me'] query alive.
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
      qc.setQueryData(['me'], user)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <form className="card stack" onSubmit={submit}>
        <h1>Ortho Practice</h1>
        <p className="muted small" style={{ margin: 0 }}>
          Cases, clinics, appointments and progress photos in one place.
        </p>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <div className="error-box">{error}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
