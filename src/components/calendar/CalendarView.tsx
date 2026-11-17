import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, CheckSquare, ChevronLeft, ChevronRight, Clock, Pencil, Plus, Trash2 } from 'lucide-react'
import { db } from '../../db/db'
import { addEvent, deleteEvent, setEventLabels, updateEvent, updateChecklistItem, type EventInput } from '../../db/repo'
import { categoryTypes, type CalendarEvent, type Category, type ChecklistItem, type EventLabel } from '../../db/types'
import { LABEL_COLORS, PASTELS, getPastel, swatch, wash } from '../../lib/colors'
import { cn, todayISO, uid } from '../../lib/utils'
import { Button, IconButton, Input, Label, Modal, Panel, Segmented, Select, Spinner, Textarea } from '../ui'
import { useFeedback } from '../ui/Feedback'
import { useCanEdit } from '../share/ShareModal'

const WEEK = ['일', '월', '화', '수', '목', '금', '토']

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function dayTitle(s: string) {
  const d = parse(s)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`
}

function timeLabel(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${pad(m)}`
}

/** 이 날짜에 걸친 일정인가 */
const onDay = (e: CalendarEvent, day: string) => e.date <= day && (e.endDate ?? e.date) >= day

/** 종일 일정 먼저, 그다음 시간순 */
const byTime = (a: CalendarEvent, b: CalendarEvent) =>
  (a.time ?? '') < (b.time ?? '') ? -1 : (a.time ?? '') > (b.time ?? '') ? 1 : a.createdAt - b.createdAt

/** 달력 칸: 그 달 1일이 있는 주의 일요일부터 6주 */
function monthCells(year: number, month: number): string[] {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  const weeks = Math.ceil((first.getDay() + new Date(year, month + 1, 0).getDate()) / 7)
  return Array.from({ length: weeks * 7 }, (_, i) => iso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)))
}

export function CalendarView({ category, className }: { category: Category; className?: string }) {
  const events = useLiveQuery(() => db.events.where('categoryId').equals(category.id).toArray(), [category.id])
  // 체크리스트 페이지에 캘린더를 함께 쓰면 목표 날짜가 있는 할 일도 보여준다
  const hasChecklist = categoryTypes(category).includes('checklist')
  const todos = useLiveQuery(
    async () => (hasChecklist ? (await db.checklist.where('categoryId').equals(category.id).toArray()).filter((i) => i.dueDate) : []),
    [category.id, hasChecklist],
  )
  const canEdit = useCanEdit()
  const today = todayISO()
  const [selected, setSelected] = useState(today)
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null)
  const p = getPastel(category.color)
  const labels = category.eventLabels ?? []
  const labelOf = (e: CalendarEvent) => (e.labelId ? labels.find((l) => l.id === e.labelId) : undefined)
  const colorOf = (e: CalendarEvent) => swatch(labelOf(e)?.color ?? e.color)

  const cells = useMemo(() => monthCells(cursor.y, cursor.m), [cursor])
  const monthPrefix = `${cursor.y}-${pad(cursor.m + 1)}`

  if (!events || !todos) return <Spinner />

  const eventsOn = (day: string) => events.filter((e) => onDay(e, day)).sort(byTime)
  const todosOn = (day: string) => todos.filter((t) => t.dueDate === day)

  const move = (dir: -1 | 1) => setCursor((c) => {
    const d = new Date(c.y, c.m + dir, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const goToday = () => {
    const d = new Date()
    setCursor({ y: d.getFullYear(), m: d.getMonth() })
    setSelected(today)
  }
  const pick = (day: string) => {
    setSelected(day)
    if (!day.startsWith(monthPrefix)) {
      const d = parse(day)
      setCursor({ y: d.getFullYear(), m: d.getMonth() })
    }
  }

  const dayEvents = eventsOn(selected)
  const dayTodos = todosOn(selected)
  const upcoming = events
    .filter((e) => (e.endDate ?? e.date) >= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : byTime(a, b)))
    .slice(0, 4)

  return (
    <div className={cn('grid grid-cols-1 items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_320px]', className)}>
      <Panel
        icon={<CalendarDays size={20} strokeWidth={1.6} style={{ color: p.fg }} />}
        title={<span className="tabular-nums">{cursor.y}년 {cursor.m + 1}월</span>}
        bodyClassName="pb-3"
        action={
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-8 px-3" onClick={goToday}>오늘</Button>
            <IconButton label="이전 달" onClick={() => move(-1)}><ChevronLeft size={17} /></IconButton>
            <IconButton label="다음 달" onClick={() => move(1)}><ChevronRight size={17} /></IconButton>
          </div>
        }
      >
        <div className="grid grid-cols-7 text-center text-[12px] font-medium text-muted">
          {WEEK.map((w, i) => (
            <div key={w} className={cn('py-2', i === 0 && 'text-danger/70', i === 6 && 'text-[#688195]')}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 overflow-hidden rounded-[var(--radius-ctl)] border border-line bg-line gap-px">
          {cells.map((day, i) => {
            const inMonth = day.startsWith(monthPrefix)
            const evs = eventsOn(day)
            const tds = todosOn(day)
            const total = evs.length + tds.length
            const isSel = day === selected
            const isToday = day === today
            return (
              <button
                key={day}
                type="button"
                onClick={() => pick(day)}
                onDoubleClick={() => {
                  if (!canEdit) return
                  pick(day)
                  setEditing('new')
                }}
                aria-label={`${dayTitle(day)}${total ? `, 일정 ${total}개` : ''}`}
                aria-pressed={isSel}
                className={cn(
                  'flex min-h-14 min-w-0 flex-col items-stretch gap-0.5 bg-card p-1 text-left transition hover:bg-hover/60 @2xl:min-h-24 @2xl:p-1.5',
                  !inMonth && 'bg-side/50',
                  isSel && 'ring-2 ring-inset ring-accent/50',
                )}
              >
                <span
                  className={cn(
                    'mx-auto flex size-6 items-center justify-center rounded-full text-[12.5px] tabular-nums @2xl:mx-0',
                    !inMonth ? 'text-muted/50' : i % 7 === 0 ? 'text-danger/80' : i % 7 === 6 ? 'text-[#688195]' : 'text-ink-2',
                    isToday && 'font-bold text-primary-ink!',
                  )}
                  style={isToday ? { background: p.fg } : undefined}
                >
                  {parse(day).getDate()}
                </span>
                {/* 좁은 화면: 점 */}
                {total > 0 && (
                  <span className="flex justify-center gap-0.5 @2xl:hidden">
                    {[...evs.map((e) => colorOf(e).fg), ...tds.map(() => 'var(--muted)')].slice(0, 3).map((c, k) => (
                      <span key={k} className="size-1.5 rounded-full" style={{ background: c }} />
                    ))}
                  </span>
                )}
                {/* 넓은 화면: 일정 이름 */}
                <span className="hidden min-w-0 flex-col gap-0.5 @2xl:flex">
                  {evs.slice(0, 3).map((e) => (
                    <span
                      key={e.id}
                      className="truncate rounded px-1.5 py-px text-[11.5px] leading-[18px]"
                      style={{ background: colorOf(e).bg, color: colorOf(e).fg }}
                    >
                      {e.time && e.date === day && <span className="mr-1 tabular-nums opacity-80">{e.time}</span>}
                      {e.title}
                    </span>
                  ))}
                  {evs.length < 3 && tds.slice(0, 3 - evs.length).map((t) => (
                    <span key={t.id} className={cn('truncate px-1 text-[11.5px] leading-[18px] text-muted', t.done && 'line-through')}>
                      ☐ {t.text}
                    </span>
                  ))}
                  {total > 3 && <span className="px-1 text-[11px] text-muted">+{total - 3}개</span>}
                </span>
              </button>
            )
          })}
        </div>
        {labels.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-2">
            {labels.map((l) => (
              <span key={l.id} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: l.color }} />
                {l.name}
              </span>
            ))}
          </div>
        )}
      </Panel>

      {/* 선택한 날 */}
      <aside className="card p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="t-section">{dayTitle(selected)}</h2>
          {canEdit && (
            <Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>일정</Button>
          )}
        </div>
        {dayEvents.length === 0 && dayTodos.length === 0 ? (
          <p className="rounded-[var(--radius-ctl)] py-8 text-center text-[13.5px] text-muted" style={{ background: wash(category.color) }}>
            일정이 없어요.{canEdit && <><br />날짜를 두 번 누르거나 '일정' 버튼으로 추가해 보세요.</>}
          </p>
        ) : (
          <ul className="space-y-2">
            {dayEvents.map((e) => (
              <li key={e.id}>
                <EventRow event={e} label={labelOf(e)} color={colorOf(e).fg} onOpen={() => setEditing(e)} />
              </li>
            ))}
            {dayTodos.map((t) => (
              <li key={t.id}>
                <TodoRow item={t} canEdit={canEdit} />
              </li>
            ))}
          </ul>
        )}

        {upcoming.length > 0 && (
          <div className="mt-6 border-t border-line pt-5">
            <p className="t-label mb-2">다가오는 일정</p>
            <ul className="space-y-1">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => pick(e.date < today ? today : e.date)} className="-mx-2 flex w-[calc(100%+16px)] items-center gap-2 rounded-[var(--radius-ctl)] px-2 py-1.5 text-left text-[13.5px] transition hover:bg-hover/60">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: colorOf(e).fg }} />
                    <span className="min-w-0 flex-1 truncate text-ink-2">{e.title}</span>
                    <span className="shrink-0 text-[12.5px] text-muted tabular-nums">{e.date.slice(5).replace('-', '.')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      <EventModal
        open={editing !== null}
        event={editing === 'new' ? null : editing}
        defaultDate={selected}
        defaultColor={category.color}
        labels={labels}
        categoryId={category.id}
        canEdit={canEdit}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

function EventRow({ event, label, color, onOpen }: { event: CalendarEvent; label?: EventLabel; color: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full gap-3 rounded-[var(--radius-ctl)] border border-line px-3 py-2.5 text-left transition hover:bg-hover/60"
    >
      <span className="w-1 shrink-0 self-stretch rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium break-words text-ink">{event.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
          {label && <span className="font-medium" style={{ color }}>{label.name}</span>}
          <span className="inline-flex items-center gap-1"><Clock size={12} />{event.time ? timeLabel(event.time) : '종일'}</span>
          {event.endDate && <span className="tabular-nums">{event.date.slice(5).replace('-', '.')} ~ {event.endDate.slice(5).replace('-', '.')}</span>}
        </span>
        {event.note && <span className="mt-1 block text-[12.5px] leading-relaxed whitespace-pre-wrap break-words text-ink-2/80">{event.note}</span>}
      </span>
    </button>
  )
}

function TodoRow({ item, canEdit }: { item: ChecklistItem; canEdit: boolean }) {
  const { run } = useFeedback()
  return (
    <label className="flex items-center gap-3 rounded-[var(--radius-ctl)] border border-dashed border-line px-3 py-2.5 text-[14px]">
      <input
        type="checkbox"
        checked={item.done}
        disabled={!canEdit}
        onChange={(e) => run(() => updateChecklistItem(item.id, { done: e.target.checked }))}
        className="check-round shrink-0"
        aria-label="완료"
      />
      <span className={cn('min-w-0 flex-1 break-words', item.done && 'text-muted line-through')}>{item.text}</span>
      <CheckSquare size={14} className="shrink-0 text-muted" aria-label="할 일" />
    </label>
  )
}

function LabelChip({ color, active, onClick, children }: { color?: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-3 text-[13px] transition',
        active ? 'font-medium text-ink' : 'border-line text-ink-2 hover:bg-hover',
      )}
      style={active ? { borderColor: color ?? 'var(--line-strong)', background: color ? swatch(color).bg : 'var(--hover)' } : undefined}
    >
      {color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="truncate">{children}</span>
    </button>
  )
}

/** 분류 이름 + 색 (자주 쓰는 색 또는 직접 고른 색) */
function LabelForm({ initial, taken, onSave, onCancel, onDelete }: {
  initial: EventLabel | null
  taken: string[]
  onSave: (data: Omit<EventLabel, 'id'>) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? LABEL_COLORS[0].color)
  const [error, setError] = useState('')
  const custom = !LABEL_COLORS.some((c) => c.color.toLowerCase() === color.toLowerCase())

  const save = () => {
    const n = name.trim()
    if (!n) return setError('분류 이름을 입력해 주세요.')
    if (taken.includes(n)) return setError('같은 이름의 분류가 이미 있어요.')
    onSave({ name: n, color })
  }

  return (
    <div className="mt-2 space-y-3 rounded-[var(--radius-ctl)] border border-line bg-side/50 p-3">
      <div>
        <Input
          value={name}
          onChange={(e) => { setName(e.target.value); setError('') }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); save() }
          }}
          placeholder="예: 기념일"
          maxLength={20}
          autoFocus
          className="h-9"
          aria-label="분류 이름"
        />
        {error && <p className="mt-1 text-[12px] text-danger">{error}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {LABEL_COLORS.map((c) => (
          <button
            key={c.color}
            type="button"
            title={c.name}
            aria-label={c.name}
            aria-pressed={color === c.color}
            onClick={() => setColor(c.color)}
            className={cn('size-7 rounded-full border-2 transition', color === c.color ? 'scale-110 border-ink/50' : 'border-transparent')}
            style={{ background: c.color }}
          />
        ))}
        <label
          title="직접 고르기"
          className={cn(
            'relative flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 transition',
            custom ? 'scale-110 border-ink/50' : 'border-transparent',
          )}
          style={{ background: custom ? color : 'conic-gradient(#D9534F, #CFA727, #4E9A6B, #4A7FC1, #7A62C2, #D9534F)' }}
        >
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="색 직접 고르기" />
        </label>
      </div>
      <div className="flex items-center gap-2">
        {onDelete && (
          <Button size="sm" variant="ghost" className="mr-auto text-danger" icon={<Trash2 size={13} />} onClick={onDelete}>지우기</Button>
        )}
        <Button size="sm" className="ml-auto" onClick={onCancel}>취소</Button>
        <Button size="sm" variant="primary" onClick={save}>{initial ? '저장' : '분류 추가'}</Button>
      </div>
    </div>
  )
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)

/** 종일 / 시간 지정 전환 + 오전·오후, 시, 분(5분 단위)을 각각 고르는 시간 선택 */
function TimePicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [h24, m] = (value ?? '09:00').split(':').map(Number)
  const pm = h24 >= 12
  const h12 = h24 % 12 || 12
  const emit = (next: { pm?: boolean; h12?: number; m?: number }) => {
    const p = next.pm ?? pm
    const h = (next.h12 ?? h12) % 12 + (p ? 12 : 0)
    onChange(`${pad(h)}:${pad(next.m ?? m)}`)
  }
  // 예전에 5분 단위가 아닌 분으로 저장된 일정도 그대로 보이도록
  const minutes = MINUTES.includes(m) ? MINUTES : [...MINUTES, m].sort((a, b) => a - b)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented<'allday' | 'time'>
        value={value ? 'time' : 'allday'}
        onChange={(v) => onChange(v === 'allday' ? null : (value ?? '09:00'))}
        options={[{ value: 'allday', label: '종일' }, { value: 'time', label: '시간 지정' }]}
      />
      {value && (
        <div className="flex items-center gap-1.5">
          <Segmented<'am' | 'pm'>
            value={pm ? 'pm' : 'am'}
            onChange={(v) => emit({ pm: v === 'pm' })}
            options={[{ value: 'am', label: '오전' }, { value: 'pm', label: '오후' }]}
          />
          <Select value={h12} onChange={(e) => emit({ h12: Number(e.target.value) })} className="h-9 w-auto min-w-[4.5rem] text-[13.5px] tabular-nums" aria-label="시">
            {HOURS.map((h) => <option key={h} value={h}>{h}시</option>)}
          </Select>
          <Select value={m} onChange={(e) => emit({ m: Number(e.target.value) })} className="h-9 w-auto min-w-[4.5rem] text-[13.5px] tabular-nums" aria-label="분">
            {minutes.map((x) => <option key={x} value={x}>{pad(x)}분</option>)}
          </Select>
        </div>
      )}
    </div>
  )
}

function EventModal({ open, event, defaultDate, defaultColor, labels, categoryId, canEdit, onClose }: {
  open: boolean
  event: CalendarEvent | null
  defaultDate: string
  defaultColor: string
  labels: EventLabel[]
  categoryId: string
  canEdit: boolean
  onClose: () => void
}) {
  const { run, confirm } = useFeedback()
  // 폼에서는 끝 날짜를 항상 채워 둔다 (하루 일정이면 시작과 같은 날). 저장할 때 같은 날이면 null로 되돌린다
  const [form, setForm] = useState<EventInput & { endDate: string }>({ title: '', date: defaultDate, endDate: defaultDate, time: null, note: '', color: defaultColor, labelId: null })
  const [error, setError] = useState('')
  /** 분류를 새로 만들거나 고치는 중 */
  const [labelEdit, setLabelEdit] = useState<EventLabel | 'new' | null>(null)

  useEffect(() => {
    if (!open) return
    setForm(
      event
        ? { title: event.title, date: event.date, endDate: event.endDate ?? event.date, time: event.time, note: event.note, color: event.color, labelId: event.labelId ?? null }
        : { title: '', date: defaultDate, endDate: defaultDate, time: null, note: '', color: defaultColor, labelId: null },
    )
    setError('')
    setLabelEdit(null)
  }, [open, event, defaultDate, defaultColor])

  const set = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }))
    setError('')
  }
  /** 시작 날짜를 바꾸면, 하루 일정이었거나 끝이 시작보다 앞서게 될 때 끝 날짜도 따라간다 */
  const setStart = (date: string) => {
    setForm((f) => ({ ...f, date, endDate: !f.endDate || f.endDate === f.date || f.endDate < date ? date : f.endDate }))
    setError('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canEdit) return onClose()
    if (!form.title.trim()) return setError('일정 이름을 입력해 주세요.')
    if (!form.date) return setError('날짜를 골라 주세요.')
    if (form.endDate && form.endDate < form.date) return setError('끝나는 날은 시작하는 날보다 뒤여야 해요.')
    const data: EventInput = { ...form, endDate: form.endDate && form.endDate !== form.date ? form.endDate : null }
    const ok = await run(
      async () => {
        if (event) await updateEvent(event.id, data)
        else await addEvent(categoryId, data)
        return true
      },
      event ? '일정을 수정했어요.' : '일정을 추가했어요.',
    )
    if (ok) onClose()
  }

  const currentLabel = labels.find((l) => l.id === form.labelId)

  /** 분류는 페이지 전체에 저장되므로 일정 저장과 상관없이 바로 반영 */
  const saveLabel = async (data: Omit<EventLabel, 'id'>) => {
    const editing = labelEdit !== 'new' && labelEdit
    const id = editing ? editing.id : uid()
    const next = editing ? labels.map((l) => (l.id === id ? { ...l, ...data } : l)) : [...labels, { id, ...data }]
    const ok = await run(async () => {
      await setEventLabels(categoryId, next)
      return true
    })
    if (!ok) return
    setLabelEdit(null)
    set({ labelId: id })
  }

  const removeLabel = async (label: EventLabel) => {
    const ok = await confirm({
      title: `'${label.name}' 분류를 지울까요?`,
      message: '이 분류를 쓰던 일정은 지워지지 않고, 분류 없이 지금 색 그대로 남아요.',
      confirmText: '지우기',
      danger: true,
    })
    if (!ok) return
    const done = await run(async () => {
      await setEventLabels(categoryId, labels.filter((l) => l.id !== label.id))
      return true
    }, '분류를 지웠어요.')
    if (!done) return
    setLabelEdit(null)
    if (form.labelId === label.id) set({ labelId: null, color: label.color })
  }

  const remove = async () => {
    if (!event) return
    const ok = await confirm({ title: '일정을 삭제할까요?', message: `"${event.title}" 일정은 되돌릴 수 없어요.`, confirmText: '삭제', danger: true })
    if (!ok) return
    const done = await run(async () => {
      await deleteEvent(event.id)
      return true
    }, '일정을 삭제했어요.')
    if (done) onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event ? (canEdit ? '일정 수정' : '일정') : '새 일정'}
      footer={
        <>
          {event && canEdit && (
            <Button variant="danger" icon={<Trash2 size={14} />} className="mr-auto" onClick={remove}>삭제</Button>
          )}
          <Button onClick={onClose}>{canEdit ? '취소' : '닫기'}</Button>
          {canEdit && <Button variant="primary" type="submit" form="event-form">{event ? '저장' : '추가'}</Button>}
        </>
      }
    >
      <form id="event-form" onSubmit={submit}>
        <fieldset disabled={!canEdit} className="min-w-0 space-y-4">
          <div>
            <Label>일정 이름</Label>
            <Input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="예: 팀 회의" autoFocus={canEdit} maxLength={100} />
            {error && <p className="mt-1 text-[12px] text-danger">{error}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>시작</Label>
              <Input type="date" value={form.date} onChange={(e) => setStart(e.target.value)} required />
            </div>
            <div>
              <Label hint={form.endDate === form.date ? '하루 일정' : undefined}>끝</Label>
              <Input type="date" value={form.endDate} min={form.date} onChange={(e) => set({ endDate: e.target.value || form.date })} />
            </div>
          </div>
          <div>
            <Label>시간</Label>
            <TimePicker value={form.time} onChange={(time) => set({ time })} />
          </div>
          <div>
            <Label hint={currentLabel ? '색은 분류를 따라가요' : undefined}>분류</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              <LabelChip active={!form.labelId} onClick={() => set({ labelId: null })}>없음</LabelChip>
              {labels.map((l) => (
                <LabelChip key={l.id} color={l.color} active={form.labelId === l.id} onClick={() => set({ labelId: l.id })}>{l.name}</LabelChip>
              ))}
              {canEdit && labelEdit === null && (
                <button
                  type="button"
                  onClick={() => setLabelEdit('new')}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-line-strong px-3 text-[13px] text-muted transition hover:bg-hover hover:text-ink"
                >
                  <Plus size={13} /> 새 분류
                </button>
              )}
            </div>
            {canEdit && currentLabel && labelEdit === null && (
              <button type="button" onClick={() => setLabelEdit(currentLabel)} className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
                <Pencil size={12} /> '{currentLabel.name}' 분류 고치기
              </button>
            )}
            {labelEdit !== null && (
              <LabelForm
                key={labelEdit === 'new' ? 'new' : labelEdit.id}
                initial={labelEdit === 'new' ? null : labelEdit}
                taken={labels.filter((l) => labelEdit === 'new' || l.id !== labelEdit.id).map((l) => l.name)}
                onCancel={() => setLabelEdit(null)}
                onSave={saveLabel}
                onDelete={labelEdit === 'new' ? undefined : () => removeLabel(labelEdit)}
              />
            )}
          </div>
          {!currentLabel && (
            <div>
              <Label>색</Label>
              <div className="flex flex-wrap gap-2">
                {PASTELS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title={c.name}
                    aria-label={c.name}
                    aria-pressed={form.color === c.id}
                    onClick={() => set({ color: c.id })}
                    className={cn('size-8 rounded-full border-2 transition', form.color === c.id ? 'scale-110 border-ink/40' : 'border-transparent')}
                    style={{ background: c.bg }}
                  />
                ))}
              </div>
            </div>
          )}
          <div>
            <Label hint="선택">메모</Label>
            <Textarea value={form.note} onChange={(e) => set({ note: e.target.value })} className="min-h-20" placeholder="장소, 준비물 등" maxLength={1000} />
          </div>
        </fieldset>
      </form>
    </Modal>
  )
}
