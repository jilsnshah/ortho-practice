import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, type Case, type Photo } from '../api'
import { formatDate, monthsBetween } from '../format'

type Side = 'before' | 'after'

export function PresentPage() {
  const id = Number(useParams().id)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const kase = useQuery({ queryKey: ['case', id], queryFn: () => api.get<Case>(`/api/cases/${id}`) })
  const photos = useQuery({ queryKey: ['photos', id], queryFn: () => api.get<Photo[]>(`/api/cases/${id}/photos`) })
  const list = photos.data ?? []

  const [after, setAfter] = useState(0)
  const [before, setBefore] = useState(0)
  const [compare, setCompare] = useState(false)
  const [side, setSide] = useState<Side>('after')
  const initialised = useRef(false)

  useEffect(() => {
    if (initialised.current || !photos.data?.length) return
    initialised.current = true
    const start = photos.data.findIndex((p) => String(p.id) === params.get('photo'))
    setAfter(start >= 0 ? start : 0)
    setBefore(0)
  }, [photos.data, params])

  const exit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    navigate(`/cases/${id}`, { replace: true })
  }, [navigate, id])

  const step = useCallback(
    (delta: number) => {
      if (!list.length) return
      const clamp = (i: number) => Math.min(list.length - 1, Math.max(0, i + delta))
      if (compare && side === 'before') setBefore(clamp)
      else setAfter(clamp)
    },
    [list.length, compare, side],
  )

  const toggleCompare = useCallback(() => {
    if (!compare) {
      // Default comparison: first photo vs. the one being shown (or the latest, if that is the first).
      setBefore(0)
      if (after === 0) setAfter(list.length - 1)
      setSide('after')
    }
    setCompare(!compare)
  }, [compare, after, list.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'Escape') exit()
      else if (e.key.toLowerCase() === 'c') toggleCompare()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, exit, toggleCompare])

  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {})
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [])

  const touchX = useRef<number | null>(null)

  const label = (p: Photo) => {
    const when = formatDate(p.taken_on)
    if (p.stage_label) return `${p.stage_label} · ${when}`
    if (!kase.data) return when
    return `Month ${Math.max(0, monthsBetween(kase.data.started_on, p.taken_on))} · ${when}`
  }

  const frame = (index: number, which: Side) => {
    const p = list[index]
    if (!p) return null
    return (
      <div
        className={`present-frame ${compare && side === which ? 'selected' : ''}`}
        onClick={() => compare && setSide(which)}
      >
        <img src={p.url} alt={label(p)} draggable={false} />
        <span className="label">
          {compare && <b>{which === 'before' ? 'Before' : 'After'} · </b>}
          {label(p)}
          {p.caption && <div className="small">{p.caption}</div>}
        </span>
        {!compare && index > 0 && (
          <button className="present-nav prev" onClick={() => step(-1)} aria-label="Previous">
            ‹
          </button>
        )}
        {!compare && index < list.length - 1 && (
          <button className="present-nav next" onClick={() => step(1)} aria-label="Next">
            ›
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className="present"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1)
      }}
    >
      <div className="present-top">
        <div className="title">
          <b>{kase.data?.patient.name ?? ''}</b>
          <span>
            {kase.data?.treatment_type?.name ?? ''}
            {list.length > 0 && !compare && ` · ${after + 1} / ${list.length}`}
            {compare && ' · tap a side, then pick a photo below'}
          </span>
        </div>
        {list.length > 1 && (
          <button className={`pbtn ${compare ? 'on' : ''}`} onClick={toggleCompare}>
            Compare
          </button>
        )}
        <button className="pbtn" onClick={exit} aria-label="Close presentation">
          ✕
        </button>
      </div>

      <div className={`present-stage ${compare ? 'compare' : ''}`}>
        {photos.isLoading && <div className="present-frame">Loading…</div>}
        {!photos.isLoading && list.length === 0 && <div className="present-frame">No photos for this case yet.</div>}
        {compare && frame(before, 'before')}
        {frame(after, 'after')}
      </div>

      {list.length > 1 && (
        <div className="present-strip">
          {list.map((p, i) => {
            const cls = i === after ? 'current' : compare && i === before ? 'other' : ''
            return (
              <button
                key={p.id}
                className={cls}
                onClick={() => (compare && side === 'before' ? setBefore(i) : setAfter(i))}
              >
                <img src={p.thumb_url} alt="" draggable={false} />
                {p.stage_label ?? formatDate(p.taken_on, { year: '2-digit' })}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
