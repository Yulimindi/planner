import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, ChevronDown, ChevronUp, GripVertical, ListChecks, Plus, Trash2, X } from 'lucide-react'
import { db } from '../../db/db'
import { addChecklistItem, deleteChecklistItem, reorderChecklist, updateChecklistItem } from '../../db/repo'
import type { Category, ChecklistItem } from '../../db/types'
import { getPastel } from '../../lib/colors'
import { useDragSort } from '../../lib/hooks'
import { cn, moveItem, todayISO } from '../../lib/utils'
import { Button, EmptyState, IconButton, Input, Segmented, Spinner } from '../ui'
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

  return (
    <div className="mx-auto max-w-3xl">
      {/* progress */}
      <div className="card mb-4 p-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[14px] font-medium">진행률</span>
          <span className="text-[13px] text-muted"><b className="text-[20px] font-semibold text-ink">{pct}%</b> · {done}/{items.length} 완료</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-side">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: p.fg, opacity: 0.55 }} />
        </div>
      </div>

      {canEdit && <form onSubmit={add} className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="새 항목을 입력하고 Enter" className="min-w-48 flex-1 border-transparent focus:border-transparent focus:ring-0" maxLength={300} />
        <label className="flex items-center gap-1.5 text-[13px] text-muted">
          <CalendarDays size={15} />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="field h-9 w-36 text-[13px]" aria-label="목표 날짜 (선택)" title="목표 날짜 (선택)" />
        </label>
        <Button type="submit" variant="primary" size="sm" className="h-9" icon={<Plus size={15} />} disabled={!text.trim()}>추가</Button>
      </form>}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented<Show>
          value={show}
          onChange={setShow}
          options={[
            { value: 'all', label: `전체 ${items.length}` },
            { value: 'active', label: `진행 중 ${items.length - done}` },
            { value: 'done', label: `완료 ${done}` },
          ]}
        />
        {done > 0 && canEdit && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={clearDone}>완료 항목 정리</Button>}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<ListChecks size={22} />} title="아직 항목이 없어요" description="위 입력창에서 첫 번째 항목을 추가해 보세요." />
      ) : visible.length === 0 ? (
        <p className="card px-4 py-8 text-center text-[13px] text-muted">{show === 'done' ? '완료한 항목이 없어요.' : '모든 항목을 완료했어요! 🎉'}</p>
      ) : (
        <fieldset disabled={!canEdit} className="min-w-0">
        <ul className="card divide-y divide-line">
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
      className={cn('group flex items-center gap-2 px-3 py-2.5 transition', dragging && 'opacity-40', over && 'bg-accent-soft/40')}
    >
      <GripVertical size={15} className={cn('hidden shrink-0 text-muted/0 sm:block', canReorder && 'cursor-grab group-hover:text-muted/60')} />
      <input
        type="checkbox"
        checked={item.done}
        onChange={(e) => run(() => updateChecklistItem(item.id, { done: e.target.checked }))}
        className="size-[18px] shrink-0 cursor-pointer"
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
