export type Ref = { id: number; name: string }
export type City = Ref
export type ClinicRef = { id: number; name: string; branch: string | null; city: Ref }

export type User = { id: number; email: string; full_name: string; role: string }

export type Clinic = {
  id: number
  name: string
  branch: string | null
  city: City
  address: string | null
  phone: string | null
  notes: string | null
  is_archived: boolean
}

export type RateCardEntry = {
  id: number
  clinic_id: number
  treatment_type: Ref
  quote_amount: number
  fee_amount: number
  material_cost: number
  profit: number
}

export type ClinicDetail = Clinic & { doctors: Ref[]; rate_card: RateCardEntry[] }

export type Doctor = {
  id: number
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  is_archived: boolean
  clinic_ids: number[]
}

export type TreatmentType = { id: number; name: string; is_archived: boolean }

export type Patient = { id: number; name: string; phone: string | null; notes: string | null }

export const CASE_STATUSES = ['consultation', 'active', 'completed', 'discontinued'] as const
export type CaseStatus = (typeof CASE_STATUSES)[number]

export type Money = {
  quote_amount: number
  fee_amount: number
  material_cost: number
}

export type Case = Money & {
  id: number
  patient: Ref
  clinic: ClinicRef
  treatment_type: Ref | null
  doctor: Ref | null
  status: CaseStatus
  started_on: string
  profit: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type Totals = Money & { count: number; profit: number }
export type CaseList = { items: Case[]; total: number; sums: Totals }

export const APPOINTMENT_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

export type Appointment = {
  id: number
  clinic: ClinicRef
  case: { id: number; status: CaseStatus; treatment_type: Ref | null } | null
  patient: Ref | null
  doctor: Ref | null
  starts_at: string
  duration_minutes: number
  status: AppointmentStatus
  notes: string | null
}

export type Photo = {
  id: number
  case_id: number
  taken_on: string
  stage_label: string | null
  caption: string | null
  width: number
  height: number
  url: string
  thumb_url: string
}

export type GroupTotals = Totals & { key: string; label: string; id: number | null }
export type Dashboard = {
  totals: Totals
  by_clinic: GroupTotals[]
  by_city: GroupTotals[]
  by_treatment_type: GroupTotals[]
  by_month: GroupTotals[]
  incomplete_case_count: number
  appointments_today: number
}

// ---- transport -----------------------------------------------------------

type ErrorDetail =
  | string
  | {
      message?: string
      field?: string
      existing?: Ref
      candidates?: Patient[]
      confirmable?: boolean
    }
  | { loc: (string | number)[]; msg: string }[]

export class ApiError extends Error {
  status: number
  detail: ErrorDetail

  constructor(status: number, detail: ErrorDetail) {
    super(describe(detail) ?? `Request failed (${status})`)
    this.status = status
    this.detail = detail
  }

  /** The already-existing record a 409 duplicate points at. */
  get existing(): Ref | undefined {
    return typeof this.detail === 'object' && !Array.isArray(this.detail) ? this.detail.existing : undefined
  }

  get confirmable(): boolean {
    return typeof this.detail === 'object' && !Array.isArray(this.detail) && !!this.detail.confirmable
  }
}

function describe(detail: ErrorDetail): string | undefined {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((d) => `${d.loc.filter((p) => p !== 'body').join('.')}: ${d.msg}`).join('; ')
  }
  return detail?.message
}

export const UNAUTHORIZED_EVENT = 'ortho:unauthorized'

type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>

function withQuery(path: string, query?: Query): string {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)))
    else params.append(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} }
  if (body instanceof FormData) {
    init.body = body
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    ;(init.headers as Record<string, string>)['Content-Type'] = 'application/json'
  }
  const res = await fetch(withQuery(path, query), init)
  if (res.status === 204) return undefined as T
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/login') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    throw new ApiError(res.status, data?.detail ?? res.statusText)
  }
  return data as T
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: (path: string) => request<void>('DELETE', path),
}
