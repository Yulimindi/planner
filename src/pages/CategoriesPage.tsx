import { Link } from 'react-router-dom'
import { Archive, ChevronDown, ChevronUp, FolderOpen, GripVertical, LayoutGrid, Pencil, Plus, Trash2 } from 'lucide-react'
import { reorderCategories } from '../db/repo'
import { useCategoryCounts, useDragSort, useSplitCategories } from '../lib/hooks'
import { Button, EmptyState, IconButton, PageHeader, Panel, Spinner } from '../components/ui'
import { ITEM_UNIT } from '../components/category/CategoryCard'
import { getPastel, tint } from '../lib/colors'
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
    <div>
      <PageHeader
        eyebrow={<><LayoutGrid size={17} strokeWidth={1.6} /> 내 카테고리 {cats.length}개</>}
        title="Categories"
        description="카테고리를 만들고, 순서를 바꾸고, 정리할 수 있어요. 공유받은 페이지는 사이드바에서 볼 수 있어요."
        actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => openCategoryForm()}>새 카테고리</Button>}
      />
      {cats.length === 0 ? (
        <EmptyState icon={<FolderOpen size={22} />} title="카테고리가 없어요" description="새 카테고리를 만들어 기록을 시작해 보세요." />
      ) : (
        <Panel
          icon={<FolderOpen size={20} strokeWidth={1.6} className="text-muted" />}
          title="전체 카테고리"
          action={<span className="hidden text-[13px] text-muted sm:inline">손잡이를 끌거나 화살표로 순서를 바꿀 수 있어요</span>}
        >
          <ul className="divide-y divide-line">
            {cats.map((c, i) => (
              <li
                key={c.id}
                {...itemProps(c.id)}
                className={cn(
                  'group -mx-2 flex items-center gap-3 rounded-[var(--radius-ctl)] px-2 py-3.5 transition hover:bg-hover',
                  dragId === c.id && 'opacity-40',
                  overId === c.id && dragId !== c.id && 'bg-accent-soft/50',
                )}
              >
                <GripVertical size={16} className="hidden shrink-0 cursor-grab text-muted/50 group-hover:text-muted sm:block" />
                <Link to={`/c/${c.id}`} draggable={false} className="flex min-w-0 flex-1 items-center gap-4">
                  <CategoryIconBadge cat={c} size={48} />
                  <div className="min-w-0">
                    <p className="truncate text-[15.5px] font-semibold tracking-[-0.01em]">{c.name}</p>
                    <p className="mt-0.5 truncate text-[13.5px] text-muted">{c.description || '설명 없음'}</p>
                  </div>
                </Link>
                <span className="hidden shrink-0 rounded-md px-2.5 py-1 text-[12.5px] leading-4 font-medium lg:inline-block" style={{ background: tint(c.color), color: getPastel(c.color).fg }}>
                  {CATEGORY_TYPE_LABEL[c.type]}
                </span>
                <span className="hidden w-20 shrink-0 text-right text-[13.5px] text-muted tabular-nums sm:inline">
                  {counts[c.id] ?? 0}개 {ITEM_UNIT[c.type]}
                </span>
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
        </Panel>
      )}
    </div>
  )
}
