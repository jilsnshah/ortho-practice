import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { SearchIcon } from './icons'
import { Sheet } from './Sheet'

export type AddFormProps<T> = {
  initialName: string
  onDone: (item: T) => void
  onCancel: () => void
}

type Props<T extends { id: number }> = {
  label: string
  /** Noun used in "Select a …" / "Add new …". */
  noun: string
  value: T | null
  onChange: (item: T | null) => void
  queryKey: readonly unknown[]
  /** Receives the search text; ignore it for small lists that are filtered locally. */
  fetchItems: (search: string) => Promise<T[]>
  serverSearch?: boolean
  getLabel: (item: T) => string
  getSub?: (item: T) => string | undefined
  /** Without this there is no way to create a record from the picker. */
  renderAdd?: (props: AddFormProps<T>) => ReactNode
  clearable?: boolean
  disabled?: boolean
  disabledHint?: string
  hint?: ReactNode
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^0-9a-z]+/g, ' ')
    .trim()

/**
 * Relationship field. The value is always an existing record (or nothing):
 * there is no free-text path. New records are created explicitly through the
 * "Add new" form, and only then selected.
 */
export function EntitySelect<T extends { id: number }>(props: Props<T>) {
  const { label, noun, value, onChange, getLabel, getSub, disabled, hint, disabledHint } = props
  const [open, setOpen] = useState(false)

  return (
    <div className="field">
      <span className="label">{label}</span>
      <button type="button" className="picker" disabled={disabled} onClick={() => setOpen(true)}>
        <span className="value">
          {value ? (
            <>
              <div>{getLabel(value)}</div>
              {getSub?.(value) && <div className="hint">{getSub(value)}</div>}
            </>
          ) : (
            <span className="placeholder">{disabled && disabledHint ? disabledHint : `Select ${noun}…`}</span>
          )}
        </span>
        <span className="chev">▾</span>
      </button>
      {hint && <div className="hint">{hint}</div>}
      {open && (
        <PickerSheet
          {...props}
          onClose={() => setOpen(false)}
          onPick={(item) => {
            onChange(item)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

function PickerSheet<T extends { id: number }>({
  noun,
  value,
  onChange,
  queryKey,
  fetchItems,
  serverSearch,
  getLabel,
  getSub,
  renderAdd,
  clearable,
  onClose,
  onPick,
}: Props<T> & { onClose: () => void; onPick: (item: T) => void }) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (!serverSearch) return
    const t = setTimeout(() => setDebounced(search.trim()), 200)
    return () => clearTimeout(t)
  }, [search, serverSearch])

  const effectiveSearch = serverSearch ? debounced : ''
  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKey, { search: effectiveSearch }],
    queryFn: () => fetchItems(effectiveSearch),
  })

  const items = useMemo(() => {
    if (!data) return []
    if (serverSearch) return data
    const q = norm(search)
    if (!q) return data
    return data.filter((item) => norm(`${getLabel(item)} ${getSub?.(item) ?? ''}`).includes(q))
  }, [data, search, serverSearch, getLabel, getSub])

  const exact = items.some((item) => norm(getLabel(item)) === norm(search))

  return (
    <Sheet title={`Select ${noun}`} onClose={onClose}>
      <div className="search">
        <SearchIcon />
        <input
          className="input"
          autoFocus
          placeholder={`Search ${noun}s`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          enterKeyHint="search"
        />
      </div>

      {renderAdd && (
        <button type="button" className="btn block" onClick={() => setAdding(true)}>
          + Add new {noun}
          {search.trim() && !exact ? ` “${search.trim()}”` : ''}
        </button>
      )}

      {error && <div className="error-box">{(error as Error).message}</div>}

      <div className="list">
        {clearable && value && (
          <button
            type="button"
            className="list-item"
            onClick={() => {
              onChange(null)
              onClose()
            }}
          >
            <span className="main muted">— None —</span>
          </button>
        )}
        {isLoading && <div className="empty">Loading…</div>}
        {!isLoading && items.length === 0 && (
          <div className="empty">
            {search ? `No ${noun} matches “${search}”.` : `No ${noun}s yet.`}
            {renderAdd && ' Add one above.'}
          </div>
        )}
        {items.map((item) => (
          <button type="button" key={item.id} className="list-item" onClick={() => onPick(item)}>
            <span className="main">
              <div className="title">{getLabel(item)}</div>
              {getSub?.(item) && <div className="sub">{getSub(item)}</div>}
            </span>
            {value?.id === item.id && <span aria-label="selected">✓</span>}
          </button>
        ))}
      </div>

      {adding && renderAdd && (
        <Sheet title={`New ${noun}`} onClose={() => setAdding(false)}>
          {renderAdd({
            initialName: search.trim(),
            onCancel: () => setAdding(false),
            onDone: (item) => {
              setAdding(false)
              onPick(item)
            },
          })}
        </Sheet>
      )}
    </Sheet>
  )
}
