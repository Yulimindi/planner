import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileText, Image as ImageIcon, Plus, Search, Star } from 'lucide-react'
import { db } from '../../db/db'
import { createMemo } from '../../db/repo'
import type { Category, Memo } from '../../db/types'
import { cn, excerpt, formatDate } from '../../lib/utils'
import { Button, EmptyState, Input, Select, Spinner } from '../ui'
import { useFeedback } from '../ui/Feedback'
import { useCanEdit } from '../share/ShareModal'
import { FavoriteButton, MemoCard, StoredImage, TagChip } from './MemoParts'

type SortKey = 'updated' | 'created' | 'title'

/** 일반 메모 / 갤러리 형식 카테고리의 메모 목록 */
export function MemoCollectionView({ category }: { category: Category }) {
  const isGallery = category.type === 'gallery'
  const navigate = useNavigate()
  const { run } = useFeedback()
  const canEdit = useCanEdit()
  const all = useLiveQuery(() => db.memos.where('categoryId').equals(category.id).toArray(), [category.id])
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const [sort, setSort] = useState<SortKey>('updated')
  const [favOnly, setFavOnly] = useState(false)

  const memos = useMemo(() => (all ?? []).filter((m) => !m.archived), [all])
  const tags = useMemo(() => [...new Set(memos.flatMap((m) => m.tags))].sort((a, b) => a.localeCompare(b, 'ko')), [memos])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = memos.filter(
      (m) =>
        (!s || [m.title, m.content, ...m.tags].join(' ').toLowerCase().includes(s)) &&
        (!tag || m.tags.includes(tag)) &&
        (!favOnly || m.favorite),
    )
    const cmp: Record<SortKey, (a: Memo, b: Memo) => number> = {
      updated: (a, b) => b.updatedAt - a.updatedAt,
      created: (a, b) => b.createdAt - a.createdAt,
      title: (a, b) => (a.title || '￿').localeCompare(b.title || '￿', 'ko'),
    }
    return list.sort(cmp[sort])
  }, [memos, q, tag, sort, favOnly])

  if (!all) return <Spinner />

  const create = async () => {
    const id = await run(() => createMemo(category.id))
    if (id) navigate(`/memo/${id}`)
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1 sm:max-w-72">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={isGallery ? '카드 검색' : '메모 검색'} className="h-9 pl-9" />
        </div>
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
        {canEdit && (
          <Button size="sm" className="ml-auto h-9" variant="primary" icon={<Plus size={15} />} onClick={create}>
            {isGallery ? '새 카드' : '새 메모'}
          </Button>
        )}
      </div>

      {memos.length === 0 ? (
        <EmptyState
          icon={isGallery ? <ImageIcon size={22} /> : <FileText size={22} />}
          title={isGallery ? '아직 카드가 없어요' : '아직 메모가 없어요'}
          description={isGallery ? '사진과 설명을 카드로 모아보세요. 이미지가 없어도 만들 수 있어요.' : '자유롭게 기록할 첫 번째 메모를 작성해 보세요.'}
          action={canEdit ? <Button variant="primary" icon={<Plus size={16} />} onClick={create}>{isGallery ? '새 카드' : '새 메모'}</Button> : undefined}
        />
      ) : shown.length === 0 ? (
        <EmptyState icon={<Search size={22} />} title="조건에 맞는 항목이 없어요" />
      ) : isGallery ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((m) => <GalleryCard key={m.id} memo={m} />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((m) => <MemoCard key={m.id} memo={m} />)}
        </div>
      )}
    </div>
  )
}

function GalleryCard({ memo }: { memo: Memo }) {
  const cover = memo.imageIds[0]
  return (
    <Link to={`/memo/${memo.id}`} className="card group relative flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
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
      <div className="p-3">
        <p className="truncate text-[14px] font-medium">{memo.title || '제목 없음'}</p>
        {memo.content && <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{excerpt(memo.content, 90)}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {memo.tags.slice(0, 2).map((t) => <TagChip key={t} tag={t} />)}
          <span className="ml-auto text-[11px] text-muted/80">{formatDate(memo.createdAt)}</span>
        </div>
      </div>
    </Link>
  )
}
