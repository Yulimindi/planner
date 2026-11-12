import { useEffect, useRef, useState } from 'react'
import { Check, ImagePlus, Loader2, X } from 'lucide-react'
import type { Aggregate, CellValue, Column, Row } from '../../db/types'
import { getPastel, PASTELS } from '../../lib/colors'
import { cn, displayUrl, isSafeUrl, normalizeUrl, uid } from '../../lib/utils'
import { deleteImage, updateColumn } from '../../db/repo'
import { SafeLink, StoredImage, useImagePicker } from '../memo/MemoParts'

/* ── 값 <-> 텍스트 ───────────────────────────────────────── */
export function cellToText(v: CellValue | undefined, col: Column): string {
  if (v === null || v === undefined || v === '') return ''
  switch (col.type) {
    case 'checkbox':
      return v === true ? '완료' : ''
    case 'select':
      return col.options.find((o) => o.id === v)?.label ?? ''
    case 'image':
      return ''
    case 'number':
      return typeof v === 'number' ? v.toLocaleString('ko-KR') : String(v)
    default:
      return String(v)
  }
}

export function compareCells(a: CellValue | undefined, b: CellValue | undefined, col: Column): number {
  const empty = (v: CellValue | undefined) => v === null || v === undefined || v === ''
  if (col.type !== 'checkbox') {
    if (empty(a) && empty(b)) return 0
    if (empty(a)) return 1
    if (empty(b)) return -1
  }
  switch (col.type) {
    case 'number':
      return Number(a) - Number(b)
    case 'checkbox':
      return Number(a === true) - Number(b === true)
    case 'select': {
      const ia = col.options.findIndex((o) => o.id === a)
      const ib = col.options.findIndex((o) => o.id === b)
      return ia - ib
    }
    default:
      return String(a).localeCompare(String(b), 'ko')
  }
}

export function aggregate(rows: Row[], col: Column): string {
  const agg: Aggregate = col.aggregate
  if (agg === 'none') return ''
  const nums = rows.map((r) => r.cells[col.id]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  const fmt = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
  switch (agg) {
    case 'count':
      return `개수 ${nums.length}`
    case 'sum':
      return `합계 ${fmt(nums.reduce((s, n) => s + n, 0))}`
    case 'avg':
      return nums.length ? `평균 ${fmt(nums.reduce((s, n) => s + n, 0) / nums.length)}` : '평균 -'
    case 'min':
      return nums.length ? `최소 ${fmt(Math.min(...nums))}` : '최소 -'
    case 'max':
      return nums.length ? `최대 ${fmt(Math.max(...nums))}` : '최대 -'
  }
}

export const AGG_LABEL: Record<Aggregate, string> = {
  none: '계산 안 함', sum: '합계', avg: '평균', min: '최소', max: '최대', count: '개수',
}

/* ── 표시용 ─────────────────────────────────────────────── */
export function SelectChip({ col, value }: { col: Column; value: CellValue | undefined }) {
  const opt = col.options.find((o) => o.id === value)
  if (!opt) return null
  const p = getPastel(opt.color)
  return (
    <span className="chip max-w-full truncate" style={{ background: `color-mix(in srgb, ${p.bg} var(--tint), var(--card-bg))`, color: p.fg }}>
      {opt.label}
    </span>
  )
}

export function CellDisplay({ col, value, compact }: { col: Column; value: CellValue | undefined; compact?: boolean }) {
  if (value === null || value === undefined || value === '') return null
  switch (col.type) {
    case 'checkbox':
      return value === true ? <Check size={15} className="text-accent" /> : null
    case 'select':
      return <SelectChip col={col} value={value} />
    case 'url':
      return <SafeLink url={String(value)} className="truncate text-ink underline decoration-line underline-offset-2 hover:decoration-muted">{displayUrl(String(value))}</SafeLink>
    case 'image':
      return <StoredImage id={String(value)} className={cn('rounded-md', compact ? 'size-7' : 'size-9')} />
    case 'number':
      return <span className="tabular-nums">{cellToText(value, col)}</span>
    case 'date':
      return <span className="tabular-nums">{String(value).replaceAll('-', '.')}</span>
    default:
      return <span className={compact ? 'truncate' : 'whitespace-pre-wrap break-words'}>{String(value)}</span>
  }
}

/* ── 편집용 ─────────────────────────────────────────────── */
/**
 * 하나의 셀 값을 편집하는 입력 요소. onCommit은 값이 확정되었을 때 호출된다.
 * inline=true 이면 표 셀 안에서 사용 (Enter/Escape로 종료).
 */
export function CellInput({ col, value, onCommit, onDone, inline, autoFocus }: {
  col: Column
  value: CellValue | undefined
  onCommit: (v: CellValue) => void
  onDone?: () => void
  inline?: boolean
  autoFocus?: boolean
}) {
  const [draft, setDraft] = useState(() =>
    value === null || value === undefined ? '' : col.type === 'number' ? String(value) : String(value),
  )
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>(null)
  const committed = useRef(false)

  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus()
      if (ref.current && 'select' in ref.current && col.type !== 'select' && col.type !== 'date') ref.current.select?.()
    }
  }, [autoFocus, col.type])

  const parse = (raw: string): CellValue => {
    if (col.type === 'number') {
      if (raw.trim() === '') return null
      const n = Number(raw.replace(/,/g, ''))
      return Number.isFinite(n) ? n : (value ?? null)
    }
    if (col.type === 'url') {
      const u = normalizeUrl(raw)
      return u && isSafeUrl(u) ? u : u ? raw.trim() : null
    }
    return raw === '' ? null : raw
  }

  const commit = (raw = draft) => {
    if (committed.current && inline) return
    committed.current = inline ?? false
    const v = parse(raw)
    if (v !== (value ?? null)) onCommit(v)
    onDone?.()
  }

  const base = inline
    ? 'w-full bg-card px-2 py-1.5 text-[14px] outline-none ring-2 ring-accent/40 rounded-md'
    : 'field h-10'

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      committed.current = true
      onDone?.()
    } else if (e.key === 'Enter' && !(col.type === 'text' && e.shiftKey)) {
      e.preventDefault()
      commit()
    }
  }

  switch (col.type) {
    case 'checkbox':
      return (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onCommit(e.target.checked)}
          className="size-4 cursor-pointer"
          aria-label={col.name}
        />
      )
    case 'image':
      return <ImageCellInput value={value} onCommit={onCommit} />
    case 'select':
      return <SelectCellInput col={col} value={value} onCommit={onCommit} onDone={onDone} base={base} selectRef={ref} />
    case 'date':
      return (
        <input
          ref={ref}
          type="date"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            if (!inline) onCommit(e.target.value || null)
          }}
          onBlur={() => inline && commit()}
          onKeyDown={keys}
          className={base}
        />
      )
    default:
      if (col.type === 'text' && !inline) {
        return (
          <textarea
            ref={ref}
            value={draft}
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit()}
            className="field min-h-10 resize-y"
          />
        )
      }
      return (
        <input
          ref={ref}
          type={col.type === 'number' ? 'text' : col.type === 'url' ? 'url' : 'text'}
          inputMode={col.type === 'number' ? 'decimal' : undefined}
          value={draft}
          placeholder={col.type === 'url' ? 'https://' : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit()}
          onKeyDown={keys}
          className={cn(base, col.type === 'number' && 'tabular-nums')}
        />
      )
  }
}

function ImageCellInput({ value, onCommit }: { value: CellValue | undefined; onCommit: (v: CellValue) => void }) {
  const id = typeof value === 'string' && value ? value : null
  const picker = useImagePicker((ids) => {
    const [first, ...rest] = ids
    rest.forEach((x) => deleteImage(x))
    if (id) deleteImage(id)
    onCommit(first)
  })
  return (
    <div className="flex items-center gap-2">
      {picker.input}
      {id ? (
        <div className="group relative">
          <button type="button" onClick={picker.open} title="이미지 변경">
            <StoredImage id={id} className="size-14 rounded-lg border border-line" />
          </button>
          <button
            type="button"
            aria-label="이미지 삭제"
            onClick={() => {
              deleteImage(id)
              onCommit(null)
            }}
            className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-line bg-card text-muted hover:text-ink"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={picker.open}
          className="flex h-10 items-center gap-1.5 rounded-[var(--radius-ctl)] border border-dashed border-line px-3 text-[13px] text-muted hover:bg-hover hover:text-ink"
        >
          {picker.busy ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />} 이미지 선택
        </button>
      )}
    </div>
  )
}

const NEW_OPTION = '__new__'

/** 선택 항목 셀: 목록에서 고르거나, 맨 아래 '새 선택지 추가'로 바로 만들어 고른다 */
function SelectCellInput({ col, value, onCommit, onDone, base, selectRef }: {
  col: Column
  value: CellValue | undefined
  onCommit: (v: CellValue) => void
  onDone?: () => void
  base: string
  selectRef: React.RefObject<HTMLSelectElement | null>
}) {
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  // 입력창으로 바뀌는 순간의 blur로 편집이 끝나지 않도록
  const switching = useRef(false)
  // Enter 뒤 입력창이 사라지며 생기는 blur로 두 번 저장되지 않도록
  const saving = useRef(false)

  const startAdding = () => {
    switching.current = true
    saving.current = false
    setLabel('')
    setAdding(true)
  }
  const cancel = () => {
    saving.current = true
    setAdding(false)
    onDone?.()
  }
  const save = async () => {
    if (saving.current) return
    saving.current = true
    const name = label.trim()
    if (!name) return cancel()
    const existing = col.options.find((o) => o.label === name)
    let id = existing?.id
    if (!id) {
      id = uid()
      await updateColumn(col.id, {
        options: [...col.options, { id, label: name, color: PASTELS[col.options.length % PASTELS.length].id }],
      })
    }
    setAdding(false)
    onCommit(id)
    onDone?.()
  }

  if (adding) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void save()
            } else if (e.key === 'Escape') cancel()
          }}
          onBlur={() => void save()}
          placeholder="새 선택지 이름"
          maxLength={60}
          className={cn(base, 'min-w-0 flex-1')}
          aria-label="새 선택지 이름"
        />
      </div>
    )
  }

  return (
    <select
      ref={selectRef}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => {
        if (e.target.value === NEW_OPTION) return startAdding()
        onCommit(e.target.value || null)
        onDone?.()
      }}
      onBlur={() => {
        if (switching.current) {
          switching.current = false
          return
        }
        onDone?.()
      }}
      onKeyDown={(e) => e.key === 'Escape' && onDone?.()}
      className={cn(base, 'field-select cursor-pointer pr-8')}
    >
      <option value="">선택 안 함</option>
      {col.options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
      <option value={NEW_OPTION}>＋ 새 선택지 추가…</option>
    </select>
  )
}
