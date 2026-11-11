import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { Category, CategoryType } from '../../db/types'
import { getPastel, wash, washLine } from '../../lib/colors'
import { useDragSort } from '../../lib/hooks'
import { cn } from '../../lib/utils'
import { reorderCategories } from '../../db/repo'
import { CategoryIconBadge } from './CategoryForm'

/** 카테고리 형식별 항목 단위 */
export const ITEM_UNIT: Record<CategoryType, string> = {
  note: '메모',
  gallery: '카드',
  table: '항목',
  checklist: '할 일',
}

export function CategoryCard({ cat, count, dragging, over, sub }: {
  cat: Category
  count: number
  dragging?: boolean
  over?: boolean
  /** 보조 정보 (예: 공유한 사람) */
  sub?: string
}) {
  const p = getPastel(cat.color)
  return (
    <Link
      to={`/c/${cat.id}`}
      draggable={false}
      className={cn(
        'group relative flex h-full min-h-[104px] items-center gap-5 rounded-[var(--radius-card)] border px-5 py-5 shadow-soft transition duration-200 hover:-translate-y-px hover:shadow-lift sm:px-6',
        dragging && 'opacity-40',
        over && 'ring-2 ring-accent/40',
      )}
      style={{ background: wash(cat.color), borderColor: washLine(cat.color) }}
    >
      <CategoryIconBadge cat={cat} size={62} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[18px] font-semibold tracking-[-0.02em] text-ink">{cat.name}</p>
        <p className="mt-1 truncate text-[14px] text-muted">
          {count}개 {ITEM_UNIT[cat.type]}
          {sub && <span> · {sub}</span>}
        </p>
      </div>
      <span
        className="flex size-[34px] shrink-0 items-center justify-center rounded-full border bg-card/80 transition group-hover:bg-card"
        style={{ borderColor: washLine(cat.color), color: p.fg }}
        aria-hidden
      >
        <ArrowRight size={16} strokeWidth={1.7} />
      </span>
    </Link>
  )
}

/** 드래그 앤 드롭으로 순서를 바꿀 수 있는 카테고리 카드 그리드 */
export function CategoryGrid({ cats, counts }: { cats: Category[]; counts: Record<string, number> }) {
  const ids = cats.map((c) => c.id)
  const { itemProps, dragId, overId } = useDragSort(ids, (next) => reorderCategories(next))
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {cats.map((c) => (
        <div key={c.id} {...itemProps(c.id)} className="cursor-grab active:cursor-grabbing">
          <CategoryCard cat={c} count={counts[c.id] ?? 0} dragging={dragId === c.id} over={overId === c.id && dragId !== c.id} />
        </div>
      ))}
    </div>
  )
}
