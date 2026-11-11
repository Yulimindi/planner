import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Clock, PenLine, Plus, Star, FileText } from 'lucide-react'
import { db } from '../db/db'
import { isVisibleMemo, useAccessMap, useCategoryCounts, useCategoryMap, useSettings, useSplitCategories } from '../lib/hooks'
import { Button, EmptyState, Section, Spinner } from '../components/ui'
import { CategoryCard, CategoryGrid } from '../components/category/CategoryCard'
import { MemoRow } from '../components/memo/MemoParts'
import { useUI } from '../components/layout/AppLayout'
import type { Category, Memo } from '../db/types'

function greeting() {
  const h = new Date().getHours()
  if (h < 6) return '고요한 밤이에요. 오늘 떠오른 생각을 정리해 볼까요?'
  if (h < 12) return '좋은 아침이에요. 오늘은 어떤 것을 기록해 볼까요?'
  if (h < 18) return '편안한 오후예요. 잠깐 떠오른 생각도 놓치지 마세요.'
  return '하루를 마무리하며 오늘의 기록을 남겨보세요.'
}

function MemoList({ memos, cats, empty }: { memos: Memo[]; cats: Map<string, Category>; empty: string }) {
  if (!memos.length) return <p className="card px-4 py-6 text-center text-[13px] text-muted">{empty}</p>
  return (
    <div className="card divide-y divide-line overflow-hidden">
      {memos.map((m) => (
        <MemoRow key={m.id} memo={m} category={m.categoryId ? cats.get(m.categoryId) : null} showCategory />
      ))}
    </div>
  )
}

export default function HomePage() {
  const settings = useSettings()
  const { owned: cats, shared } = useSplitCategories()
  const access = useAccessMap()
  const catMap = useCategoryMap()
  const counts = useCategoryCounts()
  const { openQuickMemo, openCategoryForm } = useUI()
  const memos = useLiveQuery(() => db.memos.toArray(), [])

  const { recentCreated, recentUpdated, favorites } = useMemo(() => {
    const visible = (memos ?? []).filter((m) => isVisibleMemo(m, catMap))
    return {
      recentCreated: [...visible].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5),
      recentUpdated: [...visible].filter((m) => m.updatedAt > m.createdAt + 1000).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5),
      favorites: visible.filter((m) => m.favorite).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5),
    }
  }, [memos, catMap])

  if (!cats || !memos) return <Spinner />

  return (
    <div>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[13px] text-muted">
            {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
          <h1 className="text-[28px] font-semibold tracking-tight text-ink sm:text-[32px]">{settings.appName}</h1>
          <p className="mt-1 text-[14px] text-muted">{greeting()}</p>
        </div>
        <Button variant="primary" icon={<PenLine size={16} />} onClick={openQuickMemo}>
          빠른 메모
        </Button>
      </div>

      <Section
        title="카테고리"
        action={
          <div className="flex items-center gap-3">
            <span className="hidden text-[12px] text-muted sm:inline">드래그해서 순서를 바꿀 수 있어요</span>
            <Button size="sm" variant="ghost" icon={<Plus size={15} />} onClick={() => openCategoryForm()}>
              추가
            </Button>
          </div>
        }
      >
        {cats.length ? (
          <CategoryGrid cats={cats} counts={counts} />
        ) : (
          <EmptyState
            icon={<FileText size={22} />}
            title="아직 카테고리가 없어요"
            description="주제별로 기록을 모아둘 카테고리를 만들어 보세요."
            action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => openCategoryForm()}>새 카테고리</Button>}
          />
        )}
      </Section>

      {!!shared?.length && (
        <Section title="공유받은 페이지">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shared.map((c) => (
              <div key={c.id}>
                <CategoryCard cat={c} count={counts[c.id] ?? 0} />
                <p className="mt-1 px-1 text-[12px] text-muted">{access.get(c.id)?.ownerName}님이 공유</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="grid gap-x-6 lg:grid-cols-2">
        <Section title="최근 작성한 메모" action={<Link to="/quick" className="text-[13px] text-muted hover:text-ink">Quick Memo →</Link>}>
          <MemoList memos={recentCreated} cats={catMap} empty="아직 작성한 메모가 없어요." />
        </Section>
        <Section title="최근 수정한 메모" action={<Clock size={15} className="text-muted" />}>
          <MemoList memos={recentUpdated} cats={catMap} empty="수정한 메모가 여기에 표시돼요." />
        </Section>
      </div>

      <Section title="즐겨찾기" action={<Link to="/favorites" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"><Star size={13} /> 전체 보기</Link>}>
        <MemoList memos={favorites} cats={catMap} empty="메모의 별표를 누르면 여기에 모여요." />
      </Section>
    </div>
  )
}
