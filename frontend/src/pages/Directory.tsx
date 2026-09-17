import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type City, type Doctor, type Patient, type TreatmentType } from '../api'
import { CityForm, DoctorForm, PatientForm, TreatmentTypeForm } from '../components/forms'
import { SearchIcon } from '../components/icons'
import { ErrorBox, Loading, Page } from '../components/Layout'
import { Sheet } from '../components/Sheet'
import { clinicLabel } from '../format'
import { useCities, useClinics, useDoctors, useInvalidateAll, useTreatmentTypes } from '../queries'

export function DirectoryPage() {
  const { kind } = useParams()
  switch (kind) {
    case 'doctors':
      return <Doctors />
    case 'patients':
      return <Patients />
    case 'treatment-types':
      return <TreatmentTypes />
    case 'cities':
      return <Cities />
    default:
      return (
        <Page title="Not found" back>
          <Link to="/more">Back</Link>
        </Page>
      )
  }
}

type Editing<T> = T | 'new' | null

function useRemove(endpoint: string) {
  const invalidate = useInvalidateAll()
  const [error, setError] = useState<unknown>(null)
  const remove = async (id: number, name: string) => {
    if (!confirm(`Delete “${name}”?`)) return
    setError(null)
    try {
      await api.del(`${endpoint}/${id}`)
      await invalidate()
    } catch (err) {
      setError(err)
    }
  }
  return { remove, error, setError }
}

function Doctors() {
  const [showArchived, setShowArchived] = useState(false)
  const doctors = useDoctors(null, showArchived)
  const clinics = useClinics(true)
  const invalidate = useInvalidateAll()
  const [editing, setEditing] = useState<Editing<Doctor>>(null)
  const { remove, error, setError } = useRemove('/api/doctors')
  const clinicName = (id: number) => {
    const c = clinics.data?.find((x) => x.id === id)
    return c ? clinicLabel(c) : ''
  }

  const archive = async (d: Doctor) => {
    try {
      await api.patch(`/api/doctors/${d.id}`, { is_archived: !d.is_archived })
      await invalidate()
      setEditing(null)
    } catch (err) {
      setError(err)
    }
  }

  return (
    <Page title="Doctors" back actions={<AddButton onClick={() => setEditing('new')} />}>
      <ErrorBox error={doctors.error ?? error} />
      {doctors.isLoading && <Loading />}
      <div className="list">
        {doctors.data?.length === 0 && <div className="empty">No doctors yet.</div>}
        {doctors.data?.map((d) => (
          <button key={d.id} className="list-item" onClick={() => setEditing(d)}>
            <span className="main">
              <div className="title">
                {d.name}
                {d.is_archived && <span className="badge"> archived</span>}
              </div>
              <div className="sub">
                {d.clinic_ids.map(clinicName).filter(Boolean).join(' · ') || 'No clinic linked'}
              </div>
            </span>
            {d.phone && <span className="muted small">{d.phone}</span>}
          </button>
        ))}
      </div>
      <ArchivedToggle checked={showArchived} onChange={setShowArchived} />
      {editing && (
        <Sheet title={editing === 'new' ? 'New doctor' : 'Edit doctor'} onClose={() => setEditing(null)}>
          <DoctorForm
            initial={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
          {editing !== 'new' && (
            <div className="row wrap">
              <button className="btn small" onClick={() => archive(editing)}>
                {editing.is_archived ? 'Unarchive' : 'Archive'}
              </button>
              <button
                className="btn small danger"
                onClick={async () => {
                  await remove(editing.id, editing.name)
                  setEditing(null)
                }}
              >
                Delete
              </button>
            </div>
          )}
        </Sheet>
      )}
    </Page>
  )
}

function Patients() {
  const [search, setSearch] = useState('')
  const patients = useQuery({
    queryKey: ['patients', 'directory', search.trim()],
    queryFn: () => api.get<Patient[]>('/api/patients', { q: search.trim(), limit: 200 }),
    placeholderData: keepPreviousData,
  })
  const [editing, setEditing] = useState<Editing<Patient>>(null)
  const { remove, error } = useRemove('/api/patients')

  return (
    <Page title="Patients" back actions={<AddButton onClick={() => setEditing('new')} />}>
      <div className="search">
        <SearchIcon />
        <input
          className="input"
          type="search"
          placeholder="Search name or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <ErrorBox error={patients.error ?? error} />
      <div className="list">
        {patients.data?.length === 0 && <div className="empty">No patients found.</div>}
        {patients.data?.map((p) => (
          <button key={p.id} className="list-item" onClick={() => setEditing(p)}>
            <span className="main">
              <div className="title">{p.name}</div>
              {p.phone && <div className="sub">{p.phone}</div>}
            </span>
          </button>
        ))}
      </div>
      {editing && (
        <Sheet title={editing === 'new' ? 'New patient' : 'Edit patient'} onClose={() => setEditing(null)}>
          <PatientForm
            initial={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
          {editing !== 'new' && (
            <div className="row wrap">
              <Link className="btn small" to={`/cases?q=${encodeURIComponent(editing.name)}`}>
                View cases
              </Link>
              <button
                className="btn small danger"
                onClick={async () => {
                  await remove(editing.id, editing.name)
                  setEditing(null)
                }}
              >
                Delete
              </button>
            </div>
          )}
        </Sheet>
      )}
    </Page>
  )
}

function TreatmentTypes() {
  const [showArchived, setShowArchived] = useState(false)
  const types = useTreatmentTypes(showArchived)
  const invalidate = useInvalidateAll()
  const [editing, setEditing] = useState<Editing<TreatmentType>>(null)
  const { remove, error, setError } = useRemove('/api/treatment-types')

  const archive = async (t: TreatmentType) => {
    try {
      await api.patch(`/api/treatment-types/${t.id}`, { is_archived: !t.is_archived })
      await invalidate()
      setEditing(null)
    } catch (err) {
      setError(err)
    }
  }

  return (
    <Page title="Treatment types" back actions={<AddButton onClick={() => setEditing('new')} />}>
      <ErrorBox error={types.error ?? error} />
      <div className="list">
        {types.data?.length === 0 && <div className="empty">No treatment types yet.</div>}
        {types.data?.map((t) => (
          <button key={t.id} className="list-item" onClick={() => setEditing(t)}>
            <span className="main title">
              {t.name}
              {t.is_archived && <span className="badge"> archived</span>}
            </span>
          </button>
        ))}
      </div>
      <ArchivedToggle checked={showArchived} onChange={setShowArchived} />
      {editing && (
        <Sheet
          title={editing === 'new' ? 'New treatment type' : 'Edit treatment type'}
          onClose={() => setEditing(null)}
        >
          <TreatmentTypeForm
            initial={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
          {editing !== 'new' && (
            <div className="row wrap">
              <button className="btn small" onClick={() => archive(editing)}>
                {editing.is_archived ? 'Unarchive' : 'Archive'}
              </button>
              <button
                className="btn small danger"
                onClick={async () => {
                  await remove(editing.id, editing.name)
                  setEditing(null)
                }}
              >
                Delete
              </button>
            </div>
          )}
        </Sheet>
      )}
    </Page>
  )
}

function Cities() {
  const cities = useCities()
  const [editing, setEditing] = useState<Editing<City>>(null)
  const { remove, error } = useRemove('/api/cities')

  return (
    <Page title="Cities" back actions={<AddButton onClick={() => setEditing('new')} />}>
      <ErrorBox error={cities.error ?? error} />
      <div className="list">
        {cities.data?.length === 0 && <div className="empty">No cities yet.</div>}
        {cities.data?.map((c) => (
          <button key={c.id} className="list-item" onClick={() => setEditing(c)}>
            <span className="main title">{c.name}</span>
          </button>
        ))}
      </div>
      {editing && (
        <Sheet title={editing === 'new' ? 'New city' : 'Rename city'} onClose={() => setEditing(null)}>
          <CityForm
            initial={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
          {editing !== 'new' && (
            <button
              className="btn small danger"
              onClick={async () => {
                await remove(editing.id, editing.name)
                setEditing(null)
              }}
            >
              Delete
            </button>
          )}
        </Sheet>
      )}
    </Page>
  )
}

const AddButton = ({ onClick }: { onClick: () => void }) => (
  <button className="btn primary small" onClick={onClick}>
    + Add
  </button>
)

const ArchivedToggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="check small muted">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    Show archived
  </label>
)
