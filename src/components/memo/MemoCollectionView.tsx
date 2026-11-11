import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileText, Image as ImageIcon, Plus, Search, Star, StickyNote } from 'lucide-react'
import { db } from '../../db/db'
import { createMemo } from '../../db/repo'
import { memoKind, type Category, type Memo, type MemoKind } from '../../db/types'
import { cn, excerpt, mmdd } from '../../lib/utils'
import { Button, EmptyState, Input, Segmented, Select, Spinner } from '../ui'
import { useFeedback } from '../ui/Feedback'
import { useCanEdit } from '../share/ShareModal'
import { FavoriteButton, MemoCard, StoredImage, TagChip } from './MemoParts'

type SortKey = 'updated' | 'created' | 'title'
type KindFilter = 'all' | MemoKind

/**
 * 카테고리 안의 메모·카드 목록.
 * 일반 메모 / 갤러리 카테고리에서는 본문 전체, 표·체크리스트에서는 아래에 붙는 "함께 쓰는 메모" 영역(embedded)으로 쓴다.
 * 어느 카테고리든 카드와 메모를 섞어서 만들 수 있다.
 */
export function MemoCollectionView({ category, embedded = false }: { category: Category; embedded?: boolean }) {
  const isGallery = category.type === 'gallery'
  const navigate = useNavigate()
  const { run } = useFeedback()
  const canEdit = useCanEdit()
  const all = useLiveQuery(() => db.memos.where('categoryId').equals(category.id).toArray(), [category.id])
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const [sort, setSort] = useState<SortKey>('updated')
  const [favOnly, setFavOnly] = useState(false)
  const [kind, setKind] = useState<KindFilter>('all')

  const memos = useMemo(() => (all ?? []).filter((m) => !m.archived), [all])
  const tags = useMemo(() => [...new Set(memos.flatMap((m) => m.tags))].sort((a, b) => a.localeCompare(b, 'ko')), [memos])
  const kinds = useMemo(() => new Set(memos.map((m) => memoKind(m, category))), [memos, category])
  const mixed = kinds.size > 1

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = memos.filter(
      (m) =>
        (!s || [m.title, m.content, ...m.tags].join(' ').toLowerCase().includes(s)) &&
        (!tag || m.tags.includes(tag)) &&
        (!favOnly || m.favorite) &&
        (!mixed || kind === 'all' || memoKind(m, category) === kind),
    )
    const cmp: Record<SortKey, (a: Memo, b: Memo) => number> = {
      updated: (a, b) => b.updatedAt - a.updatedAt,
      created: (a, b) => b.createdAt - a.createdAt,
      title: (a, b) => (a.title || '￿').localeCompare(b.title || '￿', 'ko'),
    }
    return list.sort(cmp[sort])
  }, [memos, q, tag, sort, favOnly, kind, mixed, category])

  if (!all) return <Spinner />

  const create = async (k: MemoKind) => {
    // 카테고리 기본 모양과 같으면 kind를 비워 두어 기존 데이터와 같은 형태로 저장
    const defaultKind = isGallery ? 'card' : 'note'
    const id = await run(() => createMemo(category.id, k === defaultKind ? {} : { kind: k }))
    if (id) navigate(`/memo/${id}`)
  }

  // 이 카테고리의 기본 모양을 먼저 보여준다
  const order: MemoKind[] = isGallery ? ['card', 'note'] : ['note', 'card']
  const createButtons = canEdit && (
    <div className="ml-auto flex items-center gap-2">
      {order.map((k, i) => (
        <Button
          key={k}
          size="sm"
          className="h-9"
          variant={i === 0 && !embedded ? 'primary' : 'secondary'}
          icon={k === 'card' ? <ImageIcon size={15} /> : <Plus size={15} />}
          onClick={() => void create(k)}
        >
          {k === 'card' ? '새 카드' : '새 메모'}
        </Button>
      ))}
    </div>
  )

  const cards = shown.filter((m) => memoKind(m, category) === 'card')
  const notes = shown.filter((m) => memoKind(m, category) === 'note')
  const cardGrid = cards.length > 0 && (
    <div className="grid grid-cols-2 items-start gap-4 @lg:grid-cols-3 @3xl:grid-cols-4">
      {cards.map((m) => <GalleryCard key={m.id} memo={m} />)}
    </div>
  )
  const noteGrid = notes.length > 0 && (
    <div className="grid items-start gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
      {notes.map((m) => <MemoCard key={m.id} memo={m} />)}
    </div>
  )
  const sectionTitle = (label: string, n: number) => (
    <p className="mb-3 flex items-center gap-2 t-label">
      {label} <span className="font-normal text-muted tabular-nums">{n}</span>
    </p>
  )
  const grids = order.map((k) => ({ k, grid: k === 'card' ? cardGrid : noteGrid, n: k === 'card' ? cards.length : notes.length }))
  const bothShown = cards.length > 0 && notes.length > 0

  // 표·체크리스트 아래: 메모가 없으면 얇은 안내 줄만
  if (embedded) {
    return (
      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StickyNote size={17} strokeWidth={1.7} className="text-accent" />
          <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">함께 쓰는 메모</h2>
          {memos.length > 0 && <span className="text-[13px] text-muted tabular-nums">{memos.length}</span>}
          {createButtons}
        </div>
        {memos.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-5 py-4 text-[13.5px] text-muted">
            {canEdit ? '표나 목록 옆에 남겨 둘 설명·사진이 있다면 메모나 카드로 함께 적어 보세요.' : '아직 함께 적은 메모가 없어요.'}
          </p>
        ) : (
          <div className="space-y-8">
            {grids.filter((g) => g.grid).map((g) => (
              <div key={g.k}>
                {bothShown && sectionTitle(g.k === 'card' ? '카드' : '메모', g.n)}
                {g.grid}
              </div>
            ))}
          </div>
        )}
      </section>
    )
  }

  const label = isGallery ? '카드' : '메모'
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1 sm:max-w-72">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${label} 검색`} className="field-pill h-10 pl-10" />
        </div>
        {mixed && (
          <Segmented<KindFilter>
            value={kind}
            onChange={setKind}
            options={[
              { value: 'all', label: '전체' },
              { value: 'card', label: '카드', icon: <ImageIcon size={14} /> },
              { value: 'note', label: '메모', icon: <FileText size={14} /> },
            ]}
          />
        )}
        {tags.length > 0 && (
          <Select value={tag} onChange={(e) => setTag(e.target.value)} className="h-9 w-auto min-w-28 text-[13px]" aria-label="태그 필터">
            <option value="">모든 태그</option>
            {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
          </Select>
        )}
        <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-9 w-auto min-w-28 text-[13px]" aria-label="정렬">
          <option value="updated">최근 수정순</option>
          <option value="created">최근 작성순</option>
          <option value="title">제목순</option>
        </Select>
        <Button size="sm" className="h-9" variant={favOnly ? 'secondary' : 'ghost'} icon={<Star size={14} className={favOnly ? 'fill-[#E3C98F] text-[#C9A960]' : ''} />} onClick={() => setFavOnly((v) => !v)}>
          즐겨찾기
        </Button>
        {createButtons}
      </div>

      {memos.length === 0 ? (
        <EmptyState
          icon={isGallery ? <ImageIcon size={22} /> : <FileText size={22} />}
          title={`아직 ${label}가 없어요`}
          description={
            isGallery
              ? '사진과 설명을 카드로 모아보세요. 글 위주의 메모도 함께 섞어 둘 수 있어요.'
              : '자유롭게 기록할 첫 번째 메모를 작성해 보세요. 사진이 중심인 카드도 함께 만들 수 있어요.'
          }
          action={canEdit ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => void create(order[0])}>새 {label}</Button> : undefined}
        />
      ) : shown.length === 0 ? (
        <EmptyState icon={<Search size={22} />} title="조건에 맞는 항목이 없어요" />
      ) : (
        <div className="space-y-9">
          {grids.filter((g) => g.grid).map((g) => (
            <div key={g.k}>
              {bothShown && sectionTitle(g.k === 'card' ? '카드' : '메모', g.n)}
              {g.grid}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GalleryCard({ memo }: { memo: Memo }) {
  const cover = memo.imageIds[0]
  return (
    <Link to={`/memo/${memo.id}`} className={cn('card group relative flex flex-col overflow-hidden card-hover')}>
      {cover ? (
        <StoredImage id={cover} className="aspect-square w-full" alt={memo.title} />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-side/50 text-muted/40">
          <ImageIcon size={28} strokeWidth={1.5} />
        </div>
      )}
      {memo.imageIds.length > 1 && (
        <span className="absolute top-2 left-2 rounded-full bg-card/90 px-2 text-[11px] text-muted">+{memo.imageIds.length - 1}</span>
      )}
      <FavoriteButton memo={memo} className={cn('absolute top-1.5 right-1.5 bg-card/80', !memo.favorite && 'sm:opacity-0 sm:group-hover:opacity-100')} />
      <div className="px-4 pt-3.5 pb-4">
        <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">{memo.title || '제목 없음'}</p>
        {memo.content && <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{excerpt(memo.content, 90)}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {memo.tags.slice(0, 2).map((t) => <TagChip key={t} tag={t} hash={false} />)}
          <span className="ml-auto text-[12.5px] text-muted tabular-nums">{mmdd(memo.createdAt)}</span>
        </div>
      </div>
    </Link>
  )
}
