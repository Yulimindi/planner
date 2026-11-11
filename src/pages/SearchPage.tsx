import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckSquare, FileText, Search, Table2 } from 'lucide-react'
import { db } from '../db/db'
import { useCategoryMap } from '../lib/hooks'
import { cellToText } from '../components/table/cells'
import { CategoryTag } from '../components/memo/MemoParts'
import { Bubble, EmptyState, PageHeader, Panel } from '../components/ui'
import { getPastel } from '../lib/colors'
import { cn, excerpt, mmdd, relativeTime } from '../lib/utils'
import type { Category, Column } from '../db/types'

interface Result {
  key: string
  kind: 'memo' | 'row' | 'check'
  title: string
  snippet: string
  to: string
  category: Category | null
  updatedAt: number
  archived: boolean
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-[#F3EEDD] px-0.5 text-ink">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

/** 일치 위치 주변을 잘라 보여준다 */
function around(text: string, q: string, len = 90) {
  const t = text.replace(/\s+/g, ' ')
  const i = t.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return excerpt(t, len)
  const start = Math.max(0, i - 30)
  return (start > 0 ? '…' : '') + t.slice(start, start + len) + (start + len < t.length ? '…' : '')
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [filter, setFilter] = useState<'all' | 'memo' | 'row' | 'check'>('all')
  const cats = useCategoryMap()
  const term = q.trim()

  useEffect(() => {
    const t = setTimeout(() => setParams(term ? { q: term } : {}, { replace: true }), 300)
    return () => clearTimeout(t)
  }, [term, setParams])

  const data = useLiveQuery(async () => {
    const [memos, rows, columns, checks] = await Promise.all([
      db.memos.toArray(), db.rows.toArray(), db.columns.toArray(), db.checklist.toArray(),
    ])
    return { memos, rows, columns, checks }
  }, [])

  const results = useMemo<Result[]>(() => {
    if (!data || !term) return []
    const s = term.toLowerCase()
    const out: Result[] = []
    const catOf = (id: string | null) => (id ? (cats.get(id) ?? null) : null)
    const isArchived = (archived: boolean, catId: string | null) => archived || !!catOf(catId)?.archived

    for (const m of data.memos) {
      const hay = [m.title, m.content, ...m.tags, ...m.tags.map((t) => '#' + t), ...m.urls].join('\n').toLowerCase()
      if (!hay.includes(s)) continue
      const tagHit = m.tags.find((t) => t.toLowerCase().includes(s.replace(/^#/, '')))
      out.push({
        key: m.id, kind: 'memo', title: m.title || excerpt(m.content, 40) || '제목 없음',
        snippet: m.content.toLowerCase().includes(s) ? around(m.content, term) : tagHit ? `#${tagHit}` : excerpt(m.content),
        to: `/memo/${m.id}`, category: catOf(m.categoryId), updatedAt: m.updatedAt, archived: isArchived(m.archived, m.categoryId),
      })
    }

    const colsByCat = new Map<string, Column[]>()
    for (const c of data.columns) colsByCat.set(c.categoryId, [...(colsByCat.get(c.categoryId) ?? []), c])
    for (const cols of colsByCat.values()) cols.sort((a, b) => a.order - b.order)
    for (const r of data.rows) {
      const cols = colsByCat.get(r.categoryId) ?? []
      const texts = cols.map((c) => ({ c, t: cellToText(r.cells[c.id], c) })).filter((x) => x.t)
      const hit = texts.find((x) => x.t.toLowerCase().includes(s))
      if (!hit) continue
      const titleCol = texts.find((x) => x.c.type === 'text') ?? texts[0]
      out.push({
        key: r.id, kind: 'row', title: titleCol?.t || '(빈 행)', snippet: `${hit.c.name}: ${around(hit.t, term, 70)}`,
        to: `/c/${r.categoryId}?row=${r.id}`, category: catOf(r.categoryId), updatedAt: r.updatedAt, archived: isArchived(false, r.categoryId),
      })
    }

    for (const i of data.checks) {
      if (!i.text.toLowerCase().includes(s)) continue
      out.push({
        key: i.id, kind: 'check', title: i.text, snippet: i.done ? '완료한 항목' : '진행 중인 항목',
        to: `/c/${i.categoryId}`, category: catOf(i.categoryId), updatedAt: i.updatedAt, archived: isArchived(false, i.categoryId),
      })
    }
    return out.sort((a, b) => Number(a.archived) - Number(b.archived) || b.updatedAt - a.updatedAt)
  }, [data, term, cats])

  const shown = filter === 'all' ? results : results.filter((r) => r.kind === filter)
  const count = (k: Result['kind']) => results.filter((r) => r.kind === k).length
  const ICON = { memo: FileText, row: Table2, check: CheckSquare }

  return (
    <div>
      <PageHeader
        eyebrow={<><Search size={17} strokeWidth={1.6} /> 제목 · 본문 · 표 데이터 · 태그</>}
        title="Search"
        description="모든 카테고리에서 원하는 기록을 찾아보세요."
      />
      <div className="relative mb-6 max-w-3xl">
        <Search size={20} strokeWidth={1.7} className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          placeholder="모든 메모를 검색해보세요…"
          className="field field-pill h-14 pl-13 text-[16px]"
        />
      </div>
      {!term ? (
        <EmptyState icon={<Search size={22} />} title="무엇을 찾고 있나요?" description="태그는 #태그 형태로도 검색할 수 있어요." />
      ) : (
        <Panel
          icon={<Search size={19} strokeWidth={1.6} className="text-muted" />}
          title={<>"{term}" 검색 결과</>}
          action={
            <div className="flex flex-wrap items-center gap-1 text-[13.5px]">
              {([['all', `전체 ${results.length}`], ['memo', `메모 ${count('memo')}`], ['row', `표 ${count('row')}`], ['check', `체크리스트 ${count('check')}`]] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFilter(v)}
                  aria-pressed={filter === v}
                  className={cn('rounded-md px-2 py-1 transition', filter === v ? 'font-semibold text-ink' : 'text-muted hover:text-ink')}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        >
          {shown.length === 0 ? (
            <p className="py-12 text-center text-[13.5px] text-muted">"{term}"에 해당하는 항목을 찾지 못했어요.</p>
          ) : (
            <div className="divide-y divide-line">
              {shown.map((r) => {
                const Icon = ICON[r.kind]
                const pc = getPastel(r.category?.color ?? 'sand')
                return (
                  <Link key={r.kind + r.key} to={r.to} className="-mx-2 flex items-center gap-4 rounded-[var(--radius-ctl)] px-2 py-3.5 transition hover:bg-hover">
                    <Bubble bg={pc.bg} fg={pc.fg} size={48}>
                      <Icon size={20} strokeWidth={1.6} />
                    </Bubble>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15.5px] font-semibold tracking-[-0.01em]"><Highlight text={r.title} q={term} /></p>
                      <p className="mt-1 truncate text-[13.5px] text-muted"><Highlight text={r.snippet} q={term} /></p>
                    </div>
                    <div className="hidden shrink-0 items-center gap-2 sm:flex">
                      {r.archived && <span className="chip bg-side text-muted">보관됨</span>}
                      <CategoryTag cat={r.category} />
                    </div>
                    <span className="w-12 shrink-0 text-right text-[13.5px] text-muted tabular-nums" title={relativeTime(r.updatedAt)}>{mmdd(r.updatedAt)}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
