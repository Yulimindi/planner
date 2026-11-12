import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ArchiveRestore, ChevronRight, Eye, LayoutGrid, LogOut, Pencil, Share2, Trash2, Users } from 'lucide-react'
import { ChatToggleButton, useSharePeers } from '../components/share/SharedChat'
import { db } from '../db/db'
import { CATEGORY_TYPE_LABEL } from '../db/types'
import { Button, IconButton, Spinner } from '../components/ui'
import { ITEM_UNIT } from '../components/category/CategoryCard'
import { wash, washLine } from '../lib/colors'
import { useCategoryCounts } from '../lib/hooks'
import { cn } from '../lib/utils'
import { useDisplayName } from '../components/user/UserBits'

const roundBtn ='size-9 rounded-full! border border-line bg-card/80 text-ink-2 shadow-soft'
import { useFeedback } from '../components/ui/Feedback'
import { CategoryIconBadge } from '../components/category/CategoryForm'
import { useCategoryActions } from '../components/category/useCategoryActions'
import { useUI } from '../components/layout/AppLayout'
import { TableView } from '../components/table/TableView'
import { ChecklistView } from '../components/checklist/ChecklistView'
import { MemoCollectionView } from '../components/memo/MemoCollectionView'
import { CanEditContext, ROLE_LABEL, ShareModal } from '../components/share/ShareModal'
import { CursorLayer, PeerAvatars, usePresence } from '../components/share/presence'
import { useAuth } from '../auth/AuthProvider'
import { api } from '../sync/api'
import { fullSync } from '../sync/engine'
import NotFoundPage from './NotFoundPage'

export default function CategoryPage() {
  const { id = '' } = useParams()
  const category = useLiveQuery(async () => (await db.categories.get(id)) ?? null, [id])
  const access = useLiveQuery(async () => (await db.access.get(id)) ?? null, [id])
  const { openCategoryForm } = useUI()
  const { archive, restore, remove } = useCategoryActions()
  const { user } = useAuth()
  const { confirm, run } = useFeedback()
  const navigate = useNavigate()
  const location = useLocation()
  const [shareOpen, setShareOpen] = useState(false)
  const counts = useCategoryCounts()
  const ownerName = useDisplayName(access?.ownerId, access?.ownerName ?? '')

  const role = access?.role ?? 'owner'
  const isOwner = role === 'owner'
  const isShared = !!access && (role !== 'owner' || access.members.length > 0)
  const peers = usePresence(category?.id, isShared, location.pathname)

  useSharePeers(peers)

  if (category === undefined) return <Spinner />
  if (category === null) return <NotFoundPage message="카테고리를 찾을 수 없어요." />

  const leave = async () => {
    if (!user) return
    const ok = await confirm({
      title: '공유에서 나갈까요?',
      message: `"${category.name}" 페이지가 내 사이드바에서 사라져요. 다시 보려면 ${ownerName}님이 다시 초대해야 해요.`,
      confirmText: '나가기',
      danger: true,
    })
    if (!ok) return
    const done = await run(async () => {
      await api(`/api/shares/${category.id}/${user.id}`, { method: 'DELETE' })
      await fullSync()
      return true
    }, '공유에서 나왔어요.')
    if (done) navigate('/')
  }

  return (
    <CanEditContext.Provider value={role !== 'view'}>
      <div key={category.id}>
        {/* 카테고리 헤더: 카테고리 색이 은은하게 깔린 큰 배너 */}
        <section
          className="relative mb-8 overflow-hidden rounded-[var(--radius-card)] border px-6 py-6 sm:px-8 sm:py-7"
          style={{ background: wash(category.color), borderColor: washLine(category.color) }}
        >
          <p className="mb-4 flex items-center gap-2 text-[13.5px] text-ink-2/75">
            <LayoutGrid size={15} strokeWidth={1.7} />
            <Link to={isOwner ? '/categories' : '/'} className="hover:text-ink">{isOwner ? 'My Categories' : 'Shared with me'}</Link>
            <ChevronRight size={14} className="text-muted" />
            <span>{CATEGORY_TYPE_LABEL[category.type]}</span>
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <CategoryIconBadge cat={category} size={72} />
            <div className="min-w-0 flex-1 basis-64">
              <h1 className="t-title truncate">{category.name}</h1>
              {category.description && <p className="mt-1.5 text-[15px] text-ink-2/80">{category.description}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
                <span className="rounded-full bg-card/80 px-3 py-1 font-medium text-ink-2">
                  {counts[category.id] ?? 0}개 {ITEM_UNIT[category.type]}
                </span>
                {category.archived && isOwner && <span className="rounded-full bg-card/80 px-3 py-1 text-muted">보관됨</span>}
                {!isOwner && access && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-card/80 px-3 py-1 text-muted">
                    {role === 'view' ? <Eye size={13} /> : <Users size={13} />}
                    <b className="font-semibold text-ink-2">{ownerName}</b>님이 공유 · {ROLE_LABEL[role]}
                  </span>
                )}
                {isOwner && !!access?.members.length && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-card/80 px-3 py-1 text-muted">
                    <Users size={13} /> {access.members.length}명과 공유 중
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PeerAvatars peers={peers} className="mr-2" />
              <ChatToggleButton />
              {isOwner ? (
                <>
                  {category.archived && (
                    <Button size="sm" icon={<ArchiveRestore size={14} />} onClick={() => restore(category)}>복원</Button>
                  )}
                  <Button size="sm" variant="primary" icon={<Share2 size={15} />} onClick={() => setShareOpen(true)}>
                    공유{access?.members.length ? ` ${access.members.length}` : ''}
                  </Button>
                  <IconButton label="카테고리 수정" className={roundBtn} onClick={() => openCategoryForm(category)}><Pencil size={16} /></IconButton>
                  {!category.archived && <IconButton label="보관" className={roundBtn} onClick={() => archive(category)}><Archive size={16} /></IconButton>}
                  <IconButton label="삭제" className={cn(roundBtn, 'hover:text-danger')} onClick={() => remove(category, true)}><Trash2 size={16} /></IconButton>
                </>
              ) : (
                <Button size="sm" icon={<LogOut size={15} />} onClick={leave}>나가기</Button>
              )}
            </div>
          </div>
        </section>

        <div className="min-w-0 @container">
          {category.type === 'table' ? (
            <>
              <TableView category={category} />
              <MemoCollectionView category={category} embedded />
            </>
          ) : category.type === 'checklist' ? (
            <>
              <ChecklistView category={category} />
              <MemoCollectionView category={category} embedded />
            </>
          ) : (
            <MemoCollectionView category={category} />
          )}
        </div>
        {isShared && <CursorLayer peers={peers} />}
        {isOwner && <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} category={category} />}
      </div>
    </CanEditContext.Provider>
  )
}
