import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { LayoutGrid, List, Star } from 'lucide-react'
import { db } from '../db/db'
import { isVisibleMemo, useCategoryMap } from '../lib/hooks'
import { EmptyState, PageHeader, Panel, Segmented, Spinner } from '../components/ui'
import { MemoCard, MemoListItem } from '../components/memo/MemoParts'

export default function FavoritesPage() {
  const all = useLiveQuery(() => db.memos.orderBy('updatedAt').reverse().toArray(), [])
  const cats = useCategoryMap()
  const memos = useMemo(() => all?.filter((m) => m.favorite && isVisibleMemo(m, cats)), [all, cats])
  const [view, setView] = useState<'grid' | 'list'>('grid')

  return (
    <div>
      <PageHeader
        eyebrow={<><Star size={17} strokeWidth={1.5} className="fill-[#EBC877] text-[#D9AE52]" /> 별표한 메모 {memos?.length ?? 0}개</>}
        title="Favorites"
        description="자주 보는 메모를 모아두는 곳이에요. 별표를 다시 누르면 해제돼요."
        actions={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'grid', label: '카드', icon: <LayoutGrid size={15} /> },
              { value: 'list', label: '목록', icon: <List size={15} /> },
            ]}
          />
        }
      />
      {!memos ? (
        <Spinner />
      ) : memos.length === 0 ? (
        <EmptyState icon={<Star size={22} />} title="즐겨찾기한 메모가 없어요" description="메모 카드의 별표를 눌러 자주 보는 메모를 모아보세요." />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {memos.map((m) => (
            <MemoCard key={m.id} memo={m} category={m.categoryId ? cats.get(m.categoryId) : null} showCategory />
          ))}
        </div>
      ) : (
        <Panel>
          <div className="divide-y divide-line">
            {memos.map((m) => (
              <MemoListItem key={m.id} memo={m} cat={m.categoryId ? (cats.get(m.categoryId) ?? null) : null} />
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
