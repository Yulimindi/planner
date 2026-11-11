import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, ChevronDown, ChevronUp, GripVertical, ListChecks, Plus, Trash2, X } from 'lucide-react'
import { db } from '../../db/db'
import { addChecklistItem, deleteChecklistItem, reorderChecklist, updateChecklistItem } from '../../db/repo'
import type { Category, ChecklistItem } from '../../db/types'
import { getPastel, wash } from '../../lib/colors'
import { useDragSort } from '../../lib/hooks'
import { cn, moveItem, todayISO } from '../../lib/utils'
import { Button, IconButton, Panel, Spinner } from '../ui'
import { useFeedback } from '../ui/Feedback'
import { useCanEdit } from '../share/ShareModal'

type Show = 'all' | 'active' | 'done'

function dueLabel(due: string): { text: string; tone: 'late' | 'soon' | 'normal' } {
  const today = todayISO()
  const diff = Math.round((new Date(due).getTime() - new Date(today).getTime()) / 86400000)
  const text = due.replaceAll('-', '.')
  if (diff < 0) return { text: `${text} · ${-diff}일 지남`, tone: 'late' }
  if (diff === 0) return { text: '오늘까지', tone: 'soon' }
  if (diff <= 3) return { text: `${text} · D-${diff}`, tone: 'soon' }
  return { text, tone: 'normal' }
}

export function ChecklistView({ category }: { category: Category }) {
  const items = useLiveQuery(() => db.checklist.where('categoryId').equals(category.id).sortBy('order'), [category.id])
  const { run, confirm } = useFeedback()
  const [text, setText] = useState('')
  const [due, setDue] = useState('')
  const [show, setShow] = useState<Show>('all')
  const ids = useMemo(() => items?.map((i) => i.id) ?? [], [items])
  const drag = useDragSort(ids, (next) => run(() => reorderChecklist(next)))
  const p = getPastel(category.color)
  const canEdit = useCanEdit()

  if (!items) return <Spinner />

  const done = items.filter((i) => i.done).length
  const pct = items.length ? Math.round((done / items.length) * 100) : 0
  const visible = items.filter((i) => (show === 'all' ? true : show === 'done' ? i.done : !i.done))

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    await run(() => addChecklistItem(category.id, text, due || null))
    setText('')
    setDue('')
  }

  const clearDone = async () => {
    const ok = await confirm({ title: `완료한 항목 ${done}개를 삭제할까요?`, message: '삭제한 항목은 되돌릴 수 없어요.', confirmText: '삭제', danger: true })
    if (ok) await run(() => db.checklist.bulkDelete(items.filter((i) => i.done).map((i) => i.id)), '완료한 항목을 정리했어요.')
  }

  const upcoming = items
    .filter((i) => !i.done && i.dueDate)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
    .slice(0, 3)
  const R = 46
  const C = 2 * Math.PI * R

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Panel
        icon={<ListChecks size={20} strokeWidth={1.6} style={{ color: p.fg }} />}
        title="할 일 목록"
        bodyClassName="pb-2"
        action={
          <div className="flex items-center gap-1 text-[13.5px]">
            {([['all', `전체 ${items.length}`], ['active', `진행 중 ${items.length - done}`], ['done', `완료 ${done}`]] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setShow(v)}
                aria-pressed={show === v}
                className={cn('rounded-md px-2 py-1 transition', show === v ? 'font-semibold text-ink' : 'text-muted hover:text-ink')}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {canEdit && (
          <form onSubmit={add} className="mt-1 mb-2 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border sm:rounded-full border-line-strong bg-card py-1.5 pr-1.5 pl-4 shadow-soft focus-within:border-accent/70 focus-within:ring-[3px] focus-within:ring-accent-soft">
            <Plus size={17} className="text-muted" />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="새 할 일을 입력하고 Enter"
              className="min-w-40 flex-1 bg-transparent py-1.5 text-[14.5px] outline-none placeholder:text-muted/70"
              maxLength={300}
            />
            <label className="flex items-center gap-1.5 text-[13px] text-muted" title="목표 날짜 (선택)">
              <CalendarDays size={15} />
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 w-[132px] rounded-full bg-side px-3 text-[12.5px] text-ink-2 outline-none" aria-label="목표 날짜 (선택)" />
            </label>
            <Button type="submit" variant="primary" size="sm" disabled={!text.trim()}>추가</Button>
          </form>
        )}

        {items.length === 0 ? (
          <p className="py-12 text-center text-[13.5px] text-muted">아직 할 일이 없어요. 위 입력창에서 첫 번째 할 일을 추가해 보세요.</p>
        ) : visible.length === 0 ? (
          <p className="py-12 text-center text-[13.5px] text-muted">{show === 'done' ? '완료한 항목이 없어요.' : '모든 항목을 완료했어요.'}</p>
        ) : (
          <fieldset disabled={!canEdit} className="min-w-0">
            <ul className="divide-y divide-line">
              {visible.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  index={ids.indexOf(item.id)}
                  total={ids.length}
                  dragProps={show === 'all' && canEdit ? drag.itemProps(item.id) : {}}
                  dragging={drag.dragId === item.id}
                  over={drag.overId === item.id && drag.dragId !== item.id}
                  onMove={(dir) => {
                    const i = ids.indexOf(item.id)
                    run(() => reorderChecklist(moveItem(ids, i, i + dir)))
                  }}
                  canReorder={show === 'all' && canEdit}
                />
              ))}
            </ul>
          </fieldset>
        )}
      </Panel>

      {/* 진행률 */}
      <aside className="card p-6">
        <h2 className="t-section mb-5">진행률</h2>
        <div className="flex items-center gap-5">
          <svg width="112" height="112" viewBox="0 0 112 112" className="shrink-0 -rotate-90" aria-hidden>
            <circle cx="56" cy="56" r={R} fill="none" stroke="var(--line)" strokeWidth="10" />
            <circle
              cx="56" cy="56" r={R} fill="none" stroke={p.fg} strokeOpacity="0.6" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} className="transition-[stroke-dashoffset] duration-700"
            />
          </svg>
          <div>
            <p className="text-[34px] leading-none font-bold tracking-[-0.03em] text-ink">{pct}<span className="text-[18px] font-semibold">%</span></p>
            <p className="mt-2 text-[13.5px] text-muted">{items.length}개 중 {done}개 완료</p>
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-3 gap-2 text-center">
          {[['전체', items.length], ['진행 중', items.length - done], ['완료', done]].map(([k, v]) => (
            <div key={k} className="rounded-[var(--radius-ctl)] py-3" style={{ background: wash(category.color) }}>
              <dd className="text-[18px] font-semibold text-ink tabular-nums">{v}</dd>
              <dt className="text-[12px] text-muted">{k}</dt>
            </div>
          ))}
        </dl>
        {upcoming.length > 0 && (
          <div className="mt-6">
            <p className="t-label mb-2">다가오는 목표일</p>
            <ul className="space-y-2">
              {upcoming.map((i) => (
                <li key={i.id} className="flex items-center gap-2 text-[13.5px]">
                  <CalendarDays size={14} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-ink-2">{i.text}</span>
                  <span className="shrink-0 text-[12.5px] text-muted tabular-nums">{i.dueDate!.slice(5).replace('-', '.')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {done > 0 && canEdit && (
          <Button size="sm" className="mt-6 w-full" icon={<Trash2 size={14} />} onClick={clearDone}>완료 항목 정리</Button>
        )}
      </aside>
    </div>
  )
}

function ChecklistRow({ item, index, total, dragProps, dragging, over, onMove, canReorder }: {
  item: ChecklistItem
  index: number
  total: number
  dragProps: object
  dragging: boolean
  over: boolean
  onMove: (dir: -1 | 1) => void
  canReorder: boolean
}) {
  const { run } = useFeedback()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.text)
  const due = item.dueDate ? dueLabel(item.dueDate) : null

  const commit = () => {
    setEditing(false)
    const v = draft.trim()
    if (!v) {
      setDraft(item.text)
      return
    }
    if (v !== item.text) run(() => updateChecklistItem(item.id, { text: v }))
  }

  return (
    <li
      {...(editing ? {} : dragProps)}
      className={cn('group -mx-2 flex items-center gap-3 rounded-[var(--radius-ctl)] px-2 py-3 transition hover:bg-hover/60', dragging && 'opacity-40', over && 'bg-accent-soft/40')}
    >
      <GripVertical size={15} className={cn('hidden shrink-0 text-muted/0 sm:block', canReorder && 'cursor-grab group-hover:text-muted/60')} />
      <input
        type="checkbox"
        checked={item.done}
        onChange={(e) => run(() => updateChecklistItem(item.id, { done: e.target.checked }))}
        className="check-round shrink-0"
        aria-label="완료"
      />
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setDraft(item.text)
                setEditing(false)
              }
            }}
            autoFocus
            className="field h-9"
          />
        ) : (
          <button type="button" onClick={() => { setDraft(item.text); setEditing(true) }} className="w-full text-left">
            <span className={cn('text-[14px] break-words', item.done && 'text-muted line-through decoration-muted/50')}>{item.text}</span>
          </button>
        )}
        {due && !editing && (
          <span className={cn('mt-0.5 inline-flex items-center gap-1 text-[12px]', item.done ? 'text-muted/70' : due.tone === 'late' ? 'text-danger' : due.tone === 'soon' ? 'text-[#A3826A]' : 'text-muted')}>
            <CalendarDays size={12} /> {due.text}
          </span>
        )}
      </div>
      <label className="relative hidden sm:block" title="목표 날짜">
        <input
          type="date"
          value={item.dueDate ?? ''}
          onChange={(e) => run(() => updateChecklistItem(item.id, { dueDate: e.target.value || null }))}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="목표 날짜"
        />
        <span className="flex size-8 items-center justify-center rounded-lg text-muted opacity-0 transition group-hover:opacity-100 hover:bg-hover"><CalendarDays size={15} /></span>
      </label>
      {item.dueDate && (
        <IconButton label="목표 날짜 지우기" className="hidden opacity-0 group-hover:opacity-100 sm:inline-flex" onClick={() => run(() => updateChecklistItem(item.id, { dueDate: null }))}>
          <X size={14} />
        </IconButton>
      )}
      {canReorder && (
        <div className="flex sm:opacity-0 sm:group-hover:opacity-100">
          <IconButton label="위로" className="size-7" disabled={index <= 0} onClick={() => onMove(-1)}><ChevronUp size={15} /></IconButton>
          <IconButton label="아래로" className="size-7" disabled={index >= total - 1} onClick={() => onMove(1)}><ChevronDown size={15} /></IconButton>
        </div>
      )}
      <IconButton label="삭제" className="hover:text-danger sm:opacity-0 sm:group-hover:opacity-100" onClick={() => run(() => deleteChecklistItem(item.id))}>
        <Trash2 size={15} />
      </IconButton>
    </li>
  )
}
