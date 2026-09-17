import type { ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { AgendaIcon, BackIcon, CasesIcon, ChartIcon, ClinicIcon, MoreIcon, TodayIcon } from './icons'

const TABS = [
  { to: '/', label: 'Today', Icon: TodayIcon, end: true, desktopOnly: false },
  { to: '/cases', label: 'Cases', Icon: CasesIcon, end: false, desktopOnly: false },
  { to: '/agenda', label: 'Agenda', Icon: AgendaIcon, end: false, desktopOnly: false },
  { to: '/clinics', label: 'Clinics', Icon: ClinicIcon, end: false, desktopOnly: false },
  // On a laptop the sidebar has room for the dashboard; on a phone it lives under "More".
  { to: '/dashboard', label: 'Dashboard', Icon: ChartIcon, end: false, desktopOnly: true },
  { to: '/more', label: 'More', Icon: MoreIcon, end: false, desktopOnly: false },
]

export function Layout() {
  return (
    <div className="app">
      <Outlet />
      <nav className="tabbar">
        <div className="brand">Ortho Practice</div>
        {TABS.map(({ to, label, Icon, end, desktopOnly }) => (
          <NavLink key={to} to={to} end={end} className={desktopOnly ? 'desktop-only' : undefined}>
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function Page({
  title,
  back,
  actions,
  children,
}: {
  title: string
  back?: boolean
  actions?: ReactNode
  children: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <>
      <header className="topbar">
        {back && (
          <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">
            <BackIcon />
          </button>
        )}
        <h1>{title}</h1>
        {actions}
      </header>
      <main className="page">{children}</main>
    </>
  )
}

export function Loading() {
  return <div className="empty">Loading…</div>
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  return <div className="error-box">{error instanceof Error ? error.message : String(error)}</div>
}
