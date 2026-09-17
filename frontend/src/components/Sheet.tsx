import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Sheets nest (e.g. "add clinic" opens "add city"); Escape closes only the top one.
const stack: { current: () => void }[] = []

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && stack.length) {
    e.preventDefault()
    stack[stack.length - 1].current()
  }
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    const entry = closeRef
    if (stack.length === 0) {
      window.addEventListener('keydown', onKey)
      document.body.style.overflow = 'hidden'
    }
    stack.push(entry)
    return () => {
      stack.splice(stack.indexOf(entry), 1)
      if (stack.length === 0) {
        window.removeEventListener('keydown', onKey)
        document.body.style.overflow = ''
      }
    }
  }, [])

  return createPortal(
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
