import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckSquare, FileText, Search, Table2 } from 'lucide-react'
import { db } from '../db/db'
import { useCategoryMap } from '../lib/hooks'
import { cellToText } from '../components/table/cells'
import { CategoryTag } from '../components/memo/MemoParts'
import { EmptyState, PageHeader, Segmented } from '../components/ui'
import { excerpt, relativeTime } from '../lib/utils'
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
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Search" description="모든 카테고리의 제목, 본문, 표 데이터, 태그를 검색해요." />
      <div className="relative mb-4">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          placeholder="검색어를 입력하세요"
          className="field h-12 rounded-2xl pl-11 text-[15px]"
        />
      </div>
      {term && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `전체 ${results.length}` },
              { value: 'memo', label: `메모 ${count('memo')}` },
              { value: 'row', label: `표 ${count('row')}` },
              { value: 'check', label: `체크리스트 ${count('check')}` },
            ]}
          />
        </div>
      )}
      {!term ? (
        <EmptyState icon={<Search size={22} />} title="무엇을 찾고 있나요?" description="태그는 #태그 형태로도 검색할 수 있어요." />
      ) : shown.length === 0 ? (
        <EmptyState icon={<Search size={22} />} title="검색 결과가 없어요" description={`"${term}"에 해당하는 항목을 찾지 못했어요.`} />
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {shown.map((r) => {
            const Icon = ICON[r.kind]
            return (
              <Link key={r.kind + r.key} to={r.to} className="flex gap-3 px-4 py-3 transition hover:bg-hover/60">
                <Icon size={16} className="mt-1 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium"><Highlight text={r.title} q={term} /></p>
                  <p className="mt-0.5 line-clamp-2 text-[13px] text-muted"><Highlight text={r.snippet} q={term} /></p>
                  <div className="mt-1.5 flex items-center gap-2 text-[12px] text-muted">
                    <CategoryTag cat={r.category} />
                    {r.archived && <span className="chip bg-side">보관됨</span>}
                    <span>{relativeTime(r.updatedAt)}</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
