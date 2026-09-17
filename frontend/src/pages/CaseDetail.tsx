import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type Appointment, type Case, type Photo } from '../api'
import { ErrorBox, Loading, Page } from '../components/Layout'
import { AppointmentRow, Badge } from '../components/rows'
import { Sheet } from '../components/Sheet'
import { clinicWithCity, formatDate, formatMoney, isoDate, monthsBetween } from '../format'
import { useInvalidateAll } from '../queries'

export function CaseDetailPage() {
  const id = Number(useParams().id)
  const kase = useQuery({ queryKey: ['case', id], queryFn: () => api.get<Case>(`/api/cases/${id}`) })
  const appts = useQuery({
    queryKey: ['appointments', { case_id: id }],
    queryFn: () => api.get<Appointment[]>('/api/appointments', { case_id: id }),
  })
  const photos = useQuery({ queryKey: ['photos', id], queryFn: () => api.get<Photo[]>(`/api/cases/${id}/photos`) })

  if (!kase.data) {
    return (
      <Page title="Case" back>
        {kase.error ? <ErrorBox error={kase.error} /> : <Loading />}
      </Page>
    )
  }
  const c = kase.data

  return (
    <Page
      title={c.patient.name}
      back
      actions={
        <Link to={`/cases/${id}/edit`} className="btn small">
          Edit
        </Link>
      }
    >
      <div className="columns">
        <div className="stack">
          <div className="card stack" style={{ gap: 8 }}>
            <div className="row">
              <h2 className="spacer" style={{ fontSize: '1.1rem' }}>
                {c.treatment_type?.name ?? <span style={{ color: 'var(--warn)' }}>Treatment not set</span>}
              </h2>
              <Badge status={c.status} />
            </div>
            <div>
              <Link to={`/clinics/${c.clinic.id}`}>{clinicWithCity(c.clinic)}</Link>
            </div>
            {c.doctor && <div className="muted">With {c.doctor.name}</div>}
            <div className="muted small">Started {formatDate(c.started_on)}</div>
            {c.notes && <div style={{ whiteSpace: 'pre-wrap' }}>{c.notes}</div>}
          </div>

          <div className="money-grid">
            <div className="tile">
              <div className="k">Patient quote</div>
              <div className="v">{formatMoney(c.quote_amount)}</div>
            </div>
            <div className="tile">
              <div className="k">Your fee</div>
              <div className="v">{formatMoney(c.fee_amount)}</div>
            </div>
            <div className="tile">
              <div className="k">Material</div>
              <div className="v">{formatMoney(c.material_cost)}</div>
            </div>
            <div className="tile accent">
              <div className="k">Profit</div>
              <div className={`v ${c.profit < 0 ? 'negative' : ''}`}>{formatMoney(c.profit)}</div>
            </div>
          </div>

          <PhotosSection kase={c} photos={photos.data} loading={photos.isLoading} error={photos.error} />
        </div>
        <div className="stack">
          <section>
            <div className="section-head">
              <h2>Appointments</h2>
              <Link to={`/appointments/new?case_id=${id}`} className="btn small">
                + Add
              </Link>
            </div>
            <div className="list">
              {appts.data?.length === 0 && <div className="empty">No appointments logged.</div>}
              {[...(appts.data ?? [])].reverse().map((a) => (
                <AppointmentRow key={a.id} a={a} showDate />
              ))}
            </div>
          </section>
        </div>
      </div>
    </Page>
  )
}

function PhotosSection({
  kase,
  photos,
  loading,
  error,
}: {
  kase: Case
  photos?: Photo[]
  loading: boolean
  error: unknown
}) {
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<File[] | null>(null)
  const [selected, setSelected] = useState<Photo | null>(null)

  return (
    <section>
      <div className="section-head">
        <h2>Progress photos</h2>
        <div className="row">
          {!!photos?.length && (
            <button className="btn small" onClick={() => navigate(`/cases/${kase.id}/present`)}>
              ▶ Present
            </button>
          )}
          <button className="btn small primary" onClick={() => fileInput.current?.click()}>
            + Photos
          </button>
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length) setPending(files)
        }}
      />
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : photos?.length ? (
        <div className="photo-grid">
          {photos.map((p) => (
            <button key={p.id} className="photo-thumb" onClick={() => setSelected(p)}>
              <img src={p.thumb_url} alt={p.stage_label ?? `Photo ${formatDate(p.taken_on)}`} loading="lazy" />
              <span className="cap">
                {p.stage_label ?? `Month ${Math.max(0, monthsBetween(kase.started_on, p.taken_on))}`}
                <br />
                {formatDate(p.taken_on, { year: '2-digit' })}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="card empty">No photos yet. Add some to build this patient’s progress timeline.</div>
      )}

      {pending && <UploadSheet kase={kase} files={pending} onClose={() => setPending(null)} />}
      {selected && photos && (
        <PhotoSheet
          photo={selected}
          onClose={() => setSelected(null)}
          onPresent={() => navigate(`/cases/${kase.id}/present?photo=${selected.id}`)}
        />
      )}
    </section>
  )
}

function UploadSheet({ kase, files, onClose }: { kase: Case; files: File[]; onClose: () => void }) {
  const invalidate = useInvalidateAll()
  const [takenOn, setTakenOn] = useState(() => isoDate(new Date(files[0].lastModified || Date.now())))
  const [stage, setStage] = useState('')
  const [done, setDone] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const upload = async () => {
    setBusy(true)
    setError(null)
    try {
      for (let i = done; i < files.length; i++) {
        const form = new FormData()
        form.append('file', files[i])
        form.append('taken_on', takenOn)
        if (stage.trim()) form.append('stage_label', stage.trim())
        await api.post(`/api/cases/${kase.id}/photos`, form)
        setDone(i + 1)
      }
      await invalidate()
      onClose()
    } catch (err) {
      setError(err)
      await invalidate()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title={`Add ${files.length} photo${files.length > 1 ? 's' : ''}`} onClose={busy ? () => {} : onClose}>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="taken">Taken on</label>
          <input
            id="taken"
            className="input"
            type="date"
            value={takenOn}
            onChange={(e) => setTakenOn(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="stage">Stage label</label>
          <input
            id="stage"
            className="input"
            placeholder={`Month ${Math.max(0, monthsBetween(kase.started_on, takenOn))}`}
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          />
        </div>
      </div>
      <div className="hint">
        e.g. “Pre-treatment”, “Month 4 – upper arch”. Leave blank to show months since the case started.
      </div>
      {busy && (
        <div className="hint">
          Uploading {Math.min(done + 1, files.length)} of {files.length}…
        </div>
      )}
      <ErrorBox error={error} />
      <div className="form-actions">
        <button className="btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn primary" onClick={upload} disabled={busy}>
          {done > 0 && error ? 'Retry remaining' : 'Upload'}
        </button>
      </div>
    </Sheet>
  )
}

function PhotoSheet({ photo, onClose, onPresent }: { photo: Photo; onClose: () => void; onPresent: () => void }) {
  const invalidate = useInvalidateAll()
  const [takenOn, setTakenOn] = useState(photo.taken_on)
  const [stage, setStage] = useState(photo.stage_label ?? '')
  const [caption, setCaption] = useState(photo.caption ?? '')
  const [error, setError] = useState<unknown>(null)

  const save = async () => {
    try {
      await api.patch(`/api/photos/${photo.id}`, { taken_on: takenOn, stage_label: stage, caption })
      await invalidate()
      onClose()
    } catch (err) {
      setError(err)
    }
  }
  const remove = async () => {
    if (!confirm('Delete this photo?')) return
    try {
      await api.del(`/api/photos/${photo.id}`)
      await invalidate()
      onClose()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <Sheet title="Photo" onClose={onClose}>
      <img className="photo-preview" src={photo.url} alt="" />
      <button className="btn block" onClick={onPresent}>
        ▶ Present from here
      </button>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="p-taken">Taken on</label>
          <input
            id="p-taken"
            className="input"
            type="date"
            value={takenOn}
            onChange={(e) => setTakenOn(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="p-stage">Stage label</label>
          <input id="p-stage" className="input" value={stage} onChange={(e) => setStage(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="p-caption">Caption</label>
        <input id="p-caption" className="input" value={caption} onChange={(e) => setCaption(e.target.value)} />
      </div>
      <ErrorBox error={error} />
      <div className="form-actions">
        <button className="btn danger" onClick={remove}>
          Delete
        </button>
        <span className="spacer" />
        <button className="btn primary" onClick={save}>
          Save
        </button>
      </div>
    </Sheet>
  )
}
