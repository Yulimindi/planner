import { Link } from 'react-router-dom'
import { Archive, ChevronDown, ChevronUp, FolderOpen, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { reorderCategories } from '../db/repo'
import { useCategoryCounts, useDragSort, useSplitCategories } from '../lib/hooks'
import { Button, EmptyState, IconButton, PageHeader, Spinner } from '../components/ui'
import { CategoryIconBadge } from '../components/category/CategoryForm'
import { useCategoryActions } from '../components/category/useCategoryActions'
import { useUI } from '../components/layout/AppLayout'
import { CATEGORY_TYPE_LABEL } from '../db/types'
import { cn, moveItem } from '../lib/utils'

export default function CategoriesPage() {
  const { owned: cats } = useSplitCategories()
  const counts = useCategoryCounts()
  const { openCategoryForm } = useUI()
  const { archive, remove } = useCategoryActions()
  const ids = cats?.map((c) => c.id) ?? []
  const { itemProps, dragId, overId } = useDragSort(ids, (next) => reorderCategories(next))

  if (!cats) return <Spinner />

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Categories"
        description="내 카테고리를 만들고, 순서를 바꾸고, 정리할 수 있어요. 공유받은 페이지는 사이드바에서 볼 수 있어요."
        actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => openCategoryForm()}>새 카테고리</Button>}
      />
      {cats.length === 0 ? (
        <EmptyState icon={<FolderOpen size={22} />} title="카테고리가 없어요" description="새 카테고리를 만들어 기록을 시작해 보세요." />
      ) : (
        <>
          <p className="mb-2 text-[12px] text-muted">왼쪽 손잡이를 드래그하거나 화살표로 순서를 바꿀 수 있어요.</p>
          <ul className="card divide-y divide-line">
            {cats.map((c, i) => (
              <li
                key={c.id}
                {...itemProps(c.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-3 transition',
                  dragId === c.id && 'opacity-40',
                  overId === c.id && dragId !== c.id && 'bg-accent-soft/40',
                )}
              >
                <GripVertical size={16} className="hidden shrink-0 cursor-grab text-muted/60 sm:block" />
                <Link to={`/c/${c.id}`} draggable={false} className="flex min-w-0 flex-1 items-center gap-3">
                  <CategoryIconBadge cat={c} size={38} />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">{c.name}</p>
                    <p className="truncate text-[12px] text-muted">
                      {CATEGORY_TYPE_LABEL[c.type]} · {counts[c.id] ?? 0}개{c.description && ` · ${c.description}`}
                    </p>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center">
                  <IconButton label="위로" disabled={i === 0} onClick={() => reorderCategories(moveItem(ids, i, i - 1))}><ChevronUp size={16} /></IconButton>
                  <IconButton label="아래로" disabled={i === cats.length - 1} onClick={() => reorderCategories(moveItem(ids, i, i + 1))}><ChevronDown size={16} /></IconButton>
                  <IconButton label="수정" onClick={() => openCategoryForm(c)}><Pencil size={15} /></IconButton>
                  <IconButton label="보관" onClick={() => archive(c)}><Archive size={15} /></IconButton>
                  <IconButton label="삭제" onClick={() => remove(c)} className="hover:text-danger"><Trash2 size={15} /></IconButton>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
