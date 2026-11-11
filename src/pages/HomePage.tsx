import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, CalendarDays, Clock3, LayoutGrid, Pencil, Plus, Sparkle, Star, Users } from 'lucide-react'
import { db } from '../db/db'
import { isVisibleMemo, useAccessMap, useCategoryCounts, useCategoryMap, useSettings, useSplitCategories } from '../lib/hooks'
import { Button, EmptyState, Panel, Section, Spinner, linkCls } from '../components/ui'
import { CategoryCard, CategoryGrid } from '../components/category/CategoryCard'
import { MemoListItem } from '../components/memo/MemoParts'
import { getPastel, wash, washLine } from '../lib/colors'
import { useUI } from '../components/layout/AppLayout'
import { cn } from '../lib/utils'
import type { Memo } from '../db/types'

/** 인사말 (참고 디자인과 같이 간결하게 고정) */
const greeting = () => '안녕하세요!'

export default function HomePage() {
  const settings = useSettings()
  const { owned: cats, shared } = useSplitCategories()
  const access = useAccessMap()
  const catMap = useCategoryMap()
  const counts = useCategoryCounts()
  const { openQuickMemo, openCategoryForm } = useUI()
  const memos = useLiveQuery(() => db.memos.toArray(), [])
  const [recentTab, setRecentTab] = useState<'created' | 'updated'>('created')

  const { recentCreated, recentUpdated, favorites } = useMemo(() => {
    const visible = (memos ?? []).filter((m) => isVisibleMemo(m, catMap))
    return {
      recentCreated: [...visible].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5),
      recentUpdated: [...visible].filter((m) => m.updatedAt > m.createdAt + 1000).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5),
      favorites: visible.filter((m) => m.favorite).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5),
    }
  }, [memos, catMap])

  if (!cats || !memos) return <Spinner />

  const recent = recentTab === 'created' ? recentCreated : recentUpdated
  const catOf = (m: Memo) => (m.categoryId ? (catMap.get(m.categoryId) ?? null) : null)

  return (
    <div>
      {/* 인사말 */}
      <header className="relative mb-11 pt-1">
        <p className="mb-5 flex items-center gap-2.5 text-[14.5px] text-ink-2/80">
          <CalendarDays size={18} strokeWidth={1.6} />
          {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
        <h1 className="t-display">{greeting()}</h1>
        <p className="mt-3 text-[16px] text-ink-2/85 sm:text-[17.5px]">
          오늘도 {settings.appName}에 새로운 기록을 남겨보세요
          <Sparkle size={16} strokeWidth={1.6} className="ml-1.5 inline -translate-y-0.5 fill-[#F0D9A8] text-[#DDBB7A] [[data-theme=cocoa]_&]:opacity-50" />
        </p>
        {/* 제목 옆 작은 반짝임 두 개 (은은하게) */}
        <Sparkle aria-hidden size={18} strokeWidth={1.4} className="absolute top-[62px] left-[64%] hidden fill-[#F3D6C7] text-[#E7B9A6] lg:block [[data-theme=cocoa]_&]:opacity-35" />
        <Sparkle aria-hidden size={24} strokeWidth={1.4} className="absolute top-[92px] left-[67%] hidden fill-[#F3D6C7] text-[#E7B9A6] lg:block [[data-theme=cocoa]_&]:opacity-35" />
      </header>

      {/* 빠른 메모 */}
      <div
        className="mb-12 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[var(--radius-card)] border px-6 py-5 sm:px-7"
        style={{ background: wash('pink'), borderColor: washLine('pink') }}
      >
        <Pencil size={30} strokeWidth={1.4} className="shrink-0" style={{ color: getPastel('pink').fg }} />
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-[17px] font-semibold tracking-[-0.01em] text-ink">빠른 메모</p>
          <p className="mt-0.5 text-[13.5px] text-muted">지금 떠오른 생각을 간단히 적어보세요!</p>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={17} />}
          onClick={openQuickMemo}
          className="h-11 w-full rounded-full! px-6 text-[14.5px] shadow-[0_4px_14px_rgb(196_143_137/0.35)] sm:w-auto"
        >
          메모 추가
        </Button>
      </div>

      {/* 카테고리 */}
      <Section
        title="My Categories"
        icon={<LayoutGrid size={20} strokeWidth={1.6} />}
        action={
          <div className="flex items-center gap-4">
            <span className="hidden text-[12.5px] text-muted lg:inline">드래그해서 순서 변경</span>
            <Link to="/categories" className={cn(linkCls, 'text-[14px]')}>전체 보기 <ArrowRight size={15} /></Link>
          </div>
        }
      >
        {cats.length ? (
          <CategoryGrid cats={cats} counts={counts} />
        ) : (
          <EmptyState
            icon={<LayoutGrid size={22} />}
            title="아직 카테고리가 없어요"
            description="주제별로 기록을 모아둘 카테고리를 만들어 보세요."
            action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => openCategoryForm()}>새 카테고리</Button>}
          />
        )}
      </Section>

      {!!shared?.length && (
        <Section title="Shared with me" icon={<Users size={18} strokeWidth={1.7} />}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shared.map((c) => (
              <CategoryCard key={c.id} cat={c} count={counts[c.id] ?? 0} sub={`${access.get(c.id)?.ownerName ?? ''}님이 공유`} />
            ))}
          </div>
        </Section>
      )}

      {/* 최근 · 즐겨찾기 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          icon={<Clock3 size={20} strokeWidth={1.6} style={{ color: getPastel('pink').fg }} />}
          title={recentTab === 'created' ? '최근 작성한 메모' : '최근 수정한 메모'}
          action={
            <div className="flex items-center gap-1 text-[13.5px]">
              {(['created', 'updated'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRecentTab(t)}
                  aria-pressed={recentTab === t}
                  className={cn('rounded-md px-2 py-1 transition', recentTab === t ? 'font-semibold text-ink' : 'text-muted hover:text-ink')}
                >
                  {t === 'created' ? '작성순' : '수정순'}
                </button>
              ))}
            </div>
          }
        >
          {recent.length ? (
            <div className="divide-y divide-line">
              {recent.map((m) => (
                <MemoListItem key={m.id} memo={m} cat={catOf(m)} date={recentTab === 'created' ? m.createdAt : m.updatedAt} />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-[13.5px] text-muted">
              {recentTab === 'created' ? '아직 작성한 메모가 없어요.' : '수정한 메모가 여기에 표시돼요.'}
            </p>
          )}
        </Panel>

        <Panel
          icon={<Star size={20} strokeWidth={1.5} className="fill-[#EBC877] text-[#D9AE52]" />}
          title="즐겨찾기"
          action={<Link to="/favorites" className={cn(linkCls, 'text-[13.5px]')}>더보기 <ArrowRight size={15} /></Link>}
        >
          {favorites.length ? (
            <div className="divide-y divide-line">
              {favorites.map((m) => (
                <MemoListItem key={m.id} memo={m} cat={catOf(m)} />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-[13.5px] text-muted">메모의 별표를 누르면 여기에 모여요.</p>
          )}
        </Panel>
      </div>
    </div>
  )
}
