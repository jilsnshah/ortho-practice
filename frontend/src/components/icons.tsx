import type { SVGProps } from 'react'

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

type P = SVGProps<SVGSVGElement>

export const TodayIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)

export const CasesIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z" />
    <rect x="4" y="6" width="16" height="15" rx="2" />
    <path d="M8 11h8M8 15h5" />
  </svg>
)

export const AgendaIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
)

export const ClinicIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 21V9l8-5 8 5v12" />
    <path d="M10 21v-5h4v5M12 9v4M10 11h4" />
  </svg>
)

export const MoreIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="19" cy="12" r="1.5" />
  </svg>
)

export const ChartIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 20V4M4 20h16" />
    <path d="M8 20v-6M13 20V9M18 20v-9" />
  </svg>
)

export const SearchIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)

export const BackIcon = (p: P) => (
  <svg {...base} width={24} height={24} {...p}>
    <path d="m15 18-6-6 6-6" />
  </svg>
)
