import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, ImagePlus, Loader2, Plus, X } from 'lucide-react'
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
      return <SelectCellInput col={col} value={value} onCommit={onCommit} onDone={onDone} inline={inline} autoFocus={autoFocus} />
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

/**
 * 선택 항목 셀: 색 칩이 보이는 드롭다운.
 * 선택지를 고르고, 옆의 색 점으로 색을 바꾸고, 맨 아래에서 새 선택지를 바로 추가할 수 있다.
 * inline(표 셀)일 때는 열리자마자 펼쳐지고, 닫히면 편집이 끝난다.
 */
function SelectCellInput({ col, value, onCommit, onDone, inline, autoFocus }: {
  col: Column
  value: CellValue | undefined
  onCommit: (v: CellValue) => void
  onDone?: () => void
  inline?: boolean
  autoFocus?: boolean
}) {
  const [open, setOpen] = useState(!!inline)
  const [colorFor, setColorFor] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (autoFocus) triggerRef.current?.focus()
  }, [autoFocus])
  const current = typeof value === 'string' && col.options.some((o) => o.id === value) ? value : ''

  const close = () => {
    setOpen(false)
    setColorFor(null)
    setLabel('')
    onDone?.()
  }
  const closeRef = useRef(close)
  closeRef.current = close

  // 화면 기준 위치로 띄운다 (표의 가로 스크롤 영역에 잘리지 않도록). 아래 공간이 부족하면 위로
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const t = triggerRef.current?.getBoundingClientRect()
      if (!t) return
      const h = popRef.current?.offsetHeight ?? 320
      const up = t.bottom + 6 + h > window.innerHeight - 8 && t.top - 6 - h > 8
      const width = Math.max(t.width, 240)
      const left = Math.max(8, Math.min(t.left, window.innerWidth - width - 8))
      setPos({ left, top: up ? t.top - 6 - h : t.bottom + 6, width })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, triggerRef, colorFor, col.options.length])

  // 바깥을 누르면 닫힘
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      closeRef.current()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open, triggerRef])

  const pick = (id: string | null) => {
    if ((id ?? '') !== current) onCommit(id)
    close()
  }

  const setColor = (optId: string, color: string) => {
    void updateColumn(col.id, { options: col.options.map((o) => (o.id === optId ? { ...o, color } : o)) })
    setColorFor(null)
  }

  const add = async () => {
    const name = label.trim()
    if (!name) return
    let id = col.options.find((o) => o.label === name)?.id
    if (!id) {
      id = uid()
      await updateColumn(col.id, {
        options: [...col.options, { id, label: name, color: PASTELS[col.options.length % PASTELS.length].id }],
      })
    }
    pick(id)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return
    // '펼쳐서 보기' 창까지 함께 닫히지 않도록
    e.stopPropagation()
    e.preventDefault()
    if (colorFor) setColorFor(null)
    else close()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (open) onKey(e)
          else if (e.key === 'ArrowDown') setOpen(true)
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex items-center gap-2 text-left',
          inline ? 'min-h-9 w-full rounded-md bg-card px-2 py-1 ring-2 ring-accent/40' : 'field h-10 w-full cursor-pointer',
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {current ? <SelectChip col={col} value={current} /> : <span className="text-muted">선택 안 함</span>}
        </span>
        <ChevronDown size={15} className="shrink-0 text-muted" />
      </button>

      {open &&
        createPortal(
          <div
            ref={popRef}
            onKeyDown={onKey}
            className="fixed z-[70] max-h-[min(420px,70dvh)] overflow-y-auto rounded-[var(--radius-card)] border border-line bg-card p-1.5 text-[14px] shadow-[0_16px_40px_rgb(47_43_40/0.16)]"
            style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { visibility: 'hidden', left: 0, top: 0 }}
          >
            <div role="listbox" aria-label={col.name}>
              <button
                type="button"
                role="option"
                aria-selected={!current}
                onClick={() => pick(null)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-muted hover:bg-hover"
              >
                <span className="flex-1">선택 안 함</span>
                {!current && <Check size={15} className="text-accent" />}
              </button>
              {col.options.map((o) => (
                <div key={o.id}>
                  <div className="flex items-center gap-1 rounded-md hover:bg-hover">
                    <button
                      type="button"
                      role="option"
                      aria-selected={current === o.id}
                      onClick={() => pick(o.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left"
                    >
                      <span className="min-w-0 flex-1 truncate"><SelectChip col={col} value={o.id} /></span>
                      {current === o.id && <Check size={15} className="shrink-0 text-accent" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setColorFor(colorFor === o.id ? null : o.id)}
                      aria-label={`${o.label} 색상 변경`}
                      aria-expanded={colorFor === o.id}
                      title="색상 변경"
                      className="mr-1 flex size-7 shrink-0 items-center justify-center rounded-full hover:bg-card"
                    >
                      <span className="size-4 rounded-full border border-line-strong/60" style={{ background: getPastel(o.color).bg }} />
                    </button>
                  </div>
                  {colorFor === o.id && (
                    <div className="mx-1 mb-1 flex flex-wrap gap-1.5 rounded-md bg-side px-2 py-2" role="group" aria-label={`${o.label} 색상`}>
                      {PASTELS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setColor(o.id, c.id)}
                          aria-label={c.name}
                          aria-pressed={o.color === c.id}
                          title={c.name}
                          className="flex size-6 items-center justify-center rounded-full border border-line-strong/50 transition hover:scale-110"
                          style={{ background: c.bg }}
                        >
                          {o.color === c.id && <Check size={12} style={{ color: c.fg }} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-1 flex items-center gap-1.5 border-t border-line px-1 pt-2 pb-0.5">
              <Plus size={15} className="ml-1 shrink-0 text-muted" />
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void add()
                  }
                }}
                placeholder="새 선택지 추가"
                maxLength={60}
                aria-label="새 선택지 이름"
                className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1.5 text-[13.5px] outline-none placeholder:text-muted/70 focus:bg-side"
              />
              {label.trim() && (
                <button type="button" onClick={() => void add()} className="shrink-0 rounded-md px-2 py-1 text-[12.5px] font-semibold text-accent hover:bg-hover">
                  추가
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
