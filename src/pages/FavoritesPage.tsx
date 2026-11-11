import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Star } from 'lucide-react'
import { db } from '../db/db'
import { isVisibleMemo, useCategoryMap } from '../lib/hooks'
import { EmptyState, PageHeader, Spinner } from '../components/ui'
import { MemoCard } from '../components/memo/MemoParts'

export default function FavoritesPage() {
  const all = useLiveQuery(() => db.memos.orderBy('updatedAt').reverse().toArray(), [])
  const cats = useCategoryMap()
  const memos = useMemo(() => all?.filter((m) => m.favorite && isVisibleMemo(m, cats)), [all, cats])

  return (
    <div>
      <PageHeader title="Favorites" description="별표를 표시한 메모가 모여 있어요. 별표를 다시 누르면 해제돼요." />
      {!memos ? (
        <Spinner />
      ) : memos.length === 0 ? (
        <EmptyState icon={<Star size={22} />} title="즐겨찾기한 메모가 없어요" description="메모 카드의 별표를 눌러 자주 보는 메모를 모아보세요." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {memos.map((m) => (
            <MemoCard key={m.id} memo={m} category={m.categoryId ? cats.get(m.categoryId) : null} showCategory />
          ))}
        </div>
      )}
    </div>
  )
}
