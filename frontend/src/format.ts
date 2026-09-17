import type { ClinicRef } from './api'

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 })

export const formatMoney = (value: number) => money.format(value)
export const formatCompact = (value: number) => `₹${compact.format(value)}`

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar date as YYYY-MM-DD (never via toISOString, which shifts to UTC). */
export function isoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** API datetimes are naive clinic-local wall-clock times: "2026-09-18T10:30:00". */
export function parseDateTime(value: string): Date {
  const [datePart, timePart = '00:00'] = value.split('T')
  const [h, min] = timePart.split(':').map(Number)
  const d = parseDate(datePart)
  d.setHours(h, min)
  return d
}

export function localDateTime(date: string, time: string): string {
  return `${date}T${time.slice(0, 5)}:00`
}

export function addDays(d: Date, days: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + days)
  return copy
}

export function startOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const offset = (copy.getDay() + 6) % 7 // Monday-based
  copy.setDate(copy.getDate() - offset)
  return copy
}

export function formatDate(value: string | Date, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = typeof value === 'string' ? parseDate(value) : value
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', ...opts })
}

export function formatTime(value: string): string {
  return parseDateTime(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}

export function clinicLabel(c: { name: string; branch: string | null }): string {
  return c.branch ? `${c.name} – ${c.branch}` : c.name
}

export function clinicWithCity(c: ClinicRef): string {
  return `${clinicLabel(c)} · ${c.city.name}`
}

export function monthsBetween(from: string, to: string): number {
  const a = parseDate(from)
  const b = parseDate(to)
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}

export const statusLabel = (s: string) => s.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase())
