import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ArchiveRestore, ArrowLeft, CalendarDays, Check, Clock3, Trash2 } from 'lucide-react'
import { db } from '../db/db'
import { deleteImage, deleteMemo, setMemoFlag, updateMemo } from '../db/repo'
import type { Memo } from '../db/types'
import { useDebouncedCallback } from '../lib/hooks'
import { formatDate } from '../lib/utils'
import { Button, Spinner } from '../components/ui'
import { useFeedback } from '../components/ui/Feedback'
import { FavoriteButton, ImageAttach, TagChip, TagInput, UrlList } from '../components/memo/MemoParts'
import { MoveMemoSelect } from '../components/memo/MoveMemoSelect'
import { CategoryIconBadge } from '../components/category/CategoryForm'
import NotFoundPage from './NotFoundPage'
import { UserName } from '../components/user/UserBits'
import { CursorLayer, PeerAvatars, usePresence } from '../components/share/presence'
import type { AccessInfo, Category } from '../db/types'

export default function MemoPage() {
  const { id = '' } = useParams()
  const memo = useLiveQuery(async () => (await db.memos.get(id)) ?? null, [id])
  const category = useLiveQuery(
    async () => (memo?.categoryId ? ((await db.categories.get(memo.categoryId)) ?? null) : null),
    [memo?.categoryId],
  )

  const access = useLiveQuery(
    async () => (memo?.categoryId ? ((await db.access.get(memo.categoryId)) ?? null) : null),
    [memo?.categoryId],
  )

  if (memo === undefined) return <Spinner />
  if (memo === null) return <NotFoundPage message="메모를 찾을 수 없어요." />
  return <MemoEditor key={memo.id} memo={memo} category={category ?? null} access={access ?? null} />
}

function MemoEditor({ memo, category, access }: { memo: Memo; category: Category | null; access: AccessInfo | null }) {
  const location = useLocation()
  const canEdit = access?.role !== 'view'
  const isShared = !!access && (access.role !== 'owner' || access.members.length > 0)
  const peers = usePresence(category?.id, isShared, location.pathname)
  const navigate = useNavigate()
  const { confirm, run } = useFeedback()
  const [title, setTitle] = useState(memo.title)
  const [content, setContent] = useState(memo.content)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle')
  const textRef = useRef<HTMLTextAreaElement>(null)

  const save = useDebouncedCallback((patch: Partial<Memo>) => {
    run(() => updateMemo(memo.id, patch)).then(() => setSaved('saved'))
  }, 450)

  // 본문 높이 자동 조절
  useEffect(() => {
    const el = textRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(240, el.scrollHeight)}px`
  }, [content])

  const backTo = category ? `/c/${category.id}` : '/quick'
  const isGallery = category?.type === 'gallery'

  const onImages = (ids: string[]) => {
    const removed = memo.imageIds.filter((x) => !ids.includes(x))
    run(async () => {
      await updateMemo(memo.id, { imageIds: ids })
      await Promise.all(removed.map(deleteImage))
    })
  }

  const remove = async () => {
    const ok = await confirm({
      title: '메모를 삭제할까요?',
      message: '삭제한 메모와 첨부 이미지는 되돌릴 수 없어요. 나중에 다시 볼 수도 있다면 보관을 이용해 보세요.',
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    save.flush()
    const done = await run(async () => {
      await deleteMemo(memo.id)
      return true
    }, '메모를 삭제했어요.')
    if (done) navigate(backTo)
  }

  const toggleArchive = () => {
    save.flush()
    run(() => setMemoFlag(memo.id, { archived: !memo.archived }), memo.archived ? '메모를 복원했어요.' : '메모를 보관했어요.')
  }

  const images = <ImageAttach ids={memo.imageIds} onChange={onImages} large={isGallery} />
  const sideLabel = (text: string, hint?: string) => (
    <div className="mb-2.5 flex items-baseline justify-between">
      <span className="t-label">{text}</span>
      {hint && <span className="text-[12px] text-muted">{hint}</span>}
    </div>
  )

  return (
    <div>
      {/* 상단: 돌아가기 · 저장 상태 · 함께 보는 사람 · 즐겨찾기 */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          to={backTo}
          onClick={() => save.flush()}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-card/90 pr-4 pl-2 text-[14px] font-medium text-ink-2 shadow-soft transition hover:text-ink"
        >
          <ArrowLeft size={16} className="ml-1 text-muted" />
          {category ? (
            <span className="inline-flex items-center gap-2">
              <CategoryIconBadge cat={category} size={26} /> {category.name}
            </span>
          ) : 'Quick Memo'}
        </Link>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-muted">
          {saved === 'saving' ? '저장 중…' : saved === 'saved' ? <><Check size={14} /> 저장됨</> : null}
        </span>
        <PeerAvatars peers={peers} />
        {canEdit && <FavoriteButton memo={memo} className="size-10 rounded-full! border border-line bg-card/90 shadow-soft" />}
      </div>

      {access && access.role !== 'owner' && (
        <div className="mb-4 rounded-[var(--radius-card)] border border-line bg-accent-soft/60 px-5 py-3 text-[13.5px] text-muted">
          <b className="text-ink"><UserName uid={access.ownerId} fallback={access.ownerName} /></b>님이 공유한 페이지의 메모 · {access.role === 'view' ? '보기 전용' : '편집 가능'}
        </div>
      )}
      {memo.archived && (
        <div className="mb-4 rounded-[var(--radius-card)] border border-line bg-side px-5 py-3 text-[13.5px] text-muted">보관된 메모예요. 일반 목록에서는 숨겨져 있어요.</div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* 본문 */}
        <fieldset disabled={!canEdit} className="card min-w-0 px-6 py-7 sm:px-10 sm:py-9">
          {isGallery && <div className="mb-7">{images}</div>}
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setSaved('saving')
              save.call({ title: e.target.value, content })
            }}
            placeholder="제목"
            maxLength={200}
            className="w-full bg-transparent text-[28px] font-bold tracking-[-0.025em] text-ink outline-none placeholder:text-muted/40 sm:text-[32px]"
          />
          <div className="mt-3 mb-7 flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line pb-6 text-[13.5px] text-muted">
            <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} strokeWidth={1.7} /> 작성 {formatDate(memo.createdAt, true)}</span>
            <span className="inline-flex items-center gap-1.5"><Clock3 size={15} strokeWidth={1.7} /> 수정 {formatDate(memo.updatedAt, true)}</span>
            {memo.tags.slice(0, 3).map((t) => <TagChip key={t} tag={t} hash={false} />)}
          </div>
          <textarea
            ref={textRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              setSaved('saving')
              save.call({ title, content: e.target.value })
            }}
            placeholder={isGallery ? '설명을 적어보세요…' : '자유롭게 기록해 보세요…'}
            className="min-h-72 w-full resize-none bg-transparent text-[16px] leading-[1.85] text-ink outline-none placeholder:text-muted/50"
          />
        </fieldset>

        {/* 정보 패널 */}
        <aside className="space-y-5">
          <fieldset disabled={!canEdit} className="card min-w-0 space-y-6 p-6">
            <div>
              {sideLabel('태그')}
              <TagInput tags={memo.tags} onChange={(tags) => run(() => updateMemo(memo.id, { tags }))} />
            </div>
            <div className="border-t border-line pt-5">
              {sideLabel('링크')}
              <UrlList urls={memo.urls} onChange={(urls) => run(() => updateMemo(memo.id, { urls }))} />
            </div>
            {!isGallery && (
              <div className="border-t border-line pt-5">
                {sideLabel('이미지', '끌어다 놓기 가능')}
                {images}
              </div>
            )}
          </fieldset>

          {canEdit && (
            <div className="card space-y-4 p-6">
              <div>
                {sideLabel('카테고리')}
                <MoveMemoSelect memo={memo} className="w-full" />
              </div>
              <div className="flex gap-2 border-t border-line pt-4">
                <Button size="sm" className="flex-1" icon={memo.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />} onClick={toggleArchive}>
                  {memo.archived ? '복원' : '보관'}
                </Button>
                <Button size="sm" variant="danger" className="flex-1" icon={<Trash2 size={15} />} onClick={remove}>
                  삭제
                </Button>
              </div>
            </div>
          )}
        </aside>
      </div>
      {isShared && <CursorLayer peers={peers} />}
    </div>
  )
}
