import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ArchiveRestore, ArrowLeft, Check, Trash2 } from 'lucide-react'
import { db } from '../db/db'
import { deleteImage, deleteMemo, setMemoFlag, updateMemo } from '../db/repo'
import type { Memo } from '../db/types'
import { useDebouncedCallback } from '../lib/hooks'
import { formatDate } from '../lib/utils'
import { Button, Label, Spinner } from '../components/ui'
import { useFeedback } from '../components/ui/Feedback'
import { FavoriteButton, ImageAttach, TagInput, UrlList } from '../components/memo/MemoParts'
import { MoveMemoSelect } from '../components/memo/MoveMemoSelect'
import { CategoryIconBadge } from '../components/category/CategoryForm'
import NotFoundPage from './NotFoundPage'
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

  const images = (
    <div>
      <Label hint="드래그해서 놓을 수도 있어요">이미지</Label>
      <ImageAttach ids={memo.imageIds} onChange={onImages} large={isGallery} />
    </div>
  )

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Link to={backTo} onClick={() => save.flush()} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[14px] text-muted hover:bg-hover hover:text-ink">
          <ArrowLeft size={16} />
          {category ? (
            <span className="inline-flex items-center gap-2">
              <CategoryIconBadge cat={category} size={22} /> {category.name}
            </span>
          ) : 'Quick Memo'}
        </Link>
        <span className="ml-auto inline-flex items-center gap-1 text-[12px] text-muted">
          {saved === 'saving' ? '저장 중…' : saved === 'saved' ? <><Check size={13} /> 저장됨</> : null}
        </span>
        <PeerAvatars peers={peers} />
        {canEdit && <FavoriteButton memo={memo} />}
      </div>
      {access && access.role !== 'owner' && (
        <div className="mb-4 rounded-xl bg-accent-soft/60 px-4 py-2.5 text-[13px] text-muted">
          <b className="text-ink">{access.ownerName}</b>님이 공유한 페이지의 메모 · {access.role === 'view' ? '보기 전용' : '편집 가능'}
        </div>
      )}

      {memo.archived && (
        <div className="mb-4 rounded-xl bg-side px-4 py-2.5 text-[13px] text-muted">보관된 메모예요. 일반 목록에서는 숨겨져 있어요.</div>
      )}

      <fieldset disabled={!canEdit} className="card min-w-0 p-5 sm:p-8">
        {isGallery && <div className="mb-6">{images}</div>}
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setSaved('saving')
            save.call({ title: e.target.value, content })
          }}
          placeholder="제목"
          maxLength={200}
          className="w-full bg-transparent text-[24px] font-semibold tracking-tight text-ink outline-none placeholder:text-muted/50"
        />
        <div className="mt-2 mb-5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
          <span>작성 {formatDate(memo.createdAt, true)}</span>
          <span>수정 {formatDate(memo.updatedAt, true)}</span>
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
          className="min-h-60 w-full resize-none bg-transparent text-[15px] leading-[1.8] text-ink outline-none placeholder:text-muted/50"
        />

        <div className="mt-6 space-y-6 border-t border-line pt-6">
          <div>
            <Label>태그</Label>
            <TagInput tags={memo.tags} onChange={(tags) => run(() => updateMemo(memo.id, { tags }))} />
          </div>
          <div>
            <Label>링크</Label>
            <UrlList urls={memo.urls} onChange={(urls) => run(() => updateMemo(memo.id, { urls }))} />
          </div>
          {!isGallery && images}
        </div>
      </fieldset>

      {canEdit && <div className="mt-4 flex flex-wrap items-center gap-2">
        <MoveMemoSelect memo={memo} />
        <div className="ml-auto flex gap-2">
          <Button size="sm" icon={memo.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />} onClick={toggleArchive}>
            {memo.archived ? '복원' : '보관'}
          </Button>
          <Button size="sm" variant="danger" icon={<Trash2 size={15} />} onClick={remove}>
            삭제
          </Button>
        </div>
      </div>}
      {isShared && <CursorLayer peers={peers} />}
    </div>
  )
}
