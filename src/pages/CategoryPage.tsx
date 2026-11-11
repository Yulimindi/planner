import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ArchiveRestore, Eye, LogOut, Pencil, Share2, Trash2, Users } from 'lucide-react'
import { db } from '../db/db'
import { CATEGORY_TYPE_LABEL } from '../db/types'
import { Button, IconButton, PageHeader, Spinner } from '../components/ui'
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

  const role = access?.role ?? 'owner'
  const isOwner = role === 'owner'
  const isShared = !!access && (role !== 'owner' || access.members.length > 0)
  const peers = usePresence(category?.id, isShared, location.pathname)

  if (category === undefined) return <Spinner />
  if (category === null) return <NotFoundPage message="카테고리를 찾을 수 없어요." />

  const leave = async () => {
    if (!user) return
    const ok = await confirm({
      title: '공유에서 나갈까요?',
      message: `"${category.name}" 페이지가 내 사이드바에서 사라져요. 다시 보려면 ${access?.ownerName}님이 다시 초대해야 해요.`,
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
        {category.archived && isOwner && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-side px-4 py-2.5 text-[13px] text-muted">
            보관된 카테고리예요. 사이드바와 홈 화면에서는 숨겨져 있어요.
            <Button size="sm" icon={<ArchiveRestore size={14} />} onClick={() => restore(category)}>복원</Button>
          </div>
        )}
        {!isOwner && access && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-accent-soft/60 px-4 py-2.5 text-[13px] text-muted">
            {role === 'view' ? <Eye size={15} /> : <Users size={15} />}
            <span>
              <b className="text-ink">{access.ownerName}</b>님이 공유한 페이지 · {ROLE_LABEL[role]}
            </span>
          </div>
        )}
        <PageHeader
          icon={<CategoryIconBadge cat={category} size={48} />}
          title={category.name}
          description={category.description || CATEGORY_TYPE_LABEL[category.type]}
          actions={
            <>
              <PeerAvatars peers={peers} className="mr-2" />
              {isOwner ? (
                <>
                  <Button size="sm" icon={<Share2 size={15} />} onClick={() => setShareOpen(true)}>
                    공유{access?.members.length ? ` ${access.members.length}` : ''}
                  </Button>
                  <IconButton label="카테고리 수정" onClick={() => openCategoryForm(category)}><Pencil size={16} /></IconButton>
                  {!category.archived && <IconButton label="보관" onClick={() => archive(category)}><Archive size={16} /></IconButton>}
                  <IconButton label="삭제" className="hover:text-danger" onClick={() => remove(category, true)}><Trash2 size={16} /></IconButton>
                </>
              ) : (
                <Button size="sm" variant="ghost" icon={<LogOut size={15} />} onClick={leave}>나가기</Button>
              )}
            </>
          }
        />
        {category.type === 'table' ? (
          <TableView category={category} />
        ) : category.type === 'checklist' ? (
          <ChecklistView category={category} />
        ) : (
          <MemoCollectionView category={category} />
        )}
        {isShared && <CursorLayer peers={peers} />}
        {isOwner && <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} category={category} />}
      </div>
    </CanEditContext.Provider>
  )
}
