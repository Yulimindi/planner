import { Link } from 'react-router-dom'
import { GripVertical } from 'lucide-react'
import type { Category } from '../../db/types'
import { CATEGORY_TYPE_LABEL } from '../../db/types'
import { getPastel } from '../../lib/colors'
import { useDragSort } from '../../lib/hooks'
import { cn } from '../../lib/utils'
import { reorderCategories } from '../../db/repo'
import { CategoryIconBadge } from './CategoryForm'

export function CategoryCard({ cat, count, dragging, over }: {
  cat: Category
  count: number
  dragging?: boolean
  over?: boolean
}) {
  const p = getPastel(cat.color)
  return (
    <Link
      to={`/c/${cat.id}`}
      draggable={false}
      className={cn(
        'card group relative flex h-full flex-col overflow-hidden p-4 transition hover:-translate-y-0.5 hover:shadow-md',
        dragging && 'opacity-40',
        over && 'ring-2 ring-accent/40',
      )}
    >
      <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: `color-mix(in srgb, ${p.bg} var(--tint), var(--card-bg))` }} />
      <div className="flex items-start justify-between">
        <CategoryIconBadge cat={cat} size={42} />
        <GripVertical size={16} className="cursor-grab text-muted/0 transition group-hover:text-muted/60" aria-hidden />
      </div>
      <p className="mt-3 truncate font-medium text-ink">{cat.name}</p>
      <p className="mt-0.5 line-clamp-1 min-h-[1.25rem] text-[12px] text-muted">{cat.description}</p>
      <div className="mt-3 flex items-center justify-between text-[12px] text-muted">
        <span>{CATEGORY_TYPE_LABEL[cat.type]}</span>
        <span className="rounded-full px-2 py-0.5 font-medium" style={{ background: `color-mix(in srgb, ${p.bg} var(--tint), var(--card-bg))`, color: p.fg }}>
          {count}
        </span>
      </div>
    </Link>
  )
}

/** 드래그 앤 드롭으로 순서를 바꿀 수 있는 카테고리 카드 그리드 */
export function CategoryGrid({ cats, counts }: { cats: Category[]; counts: Record<string, number> }) {
  const ids = cats.map((c) => c.id)
  const { itemProps, dragId, overId } = useDragSort(ids, (next) => reorderCategories(next))
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {cats.map((c) => (
        <div key={c.id} {...itemProps(c.id)}>
          <CategoryCard cat={c} count={counts[c.id] ?? 0} dragging={dragId === c.id} over={overId === c.id && dragId !== c.id} />
        </div>
      ))}
    </div>
  )
}
