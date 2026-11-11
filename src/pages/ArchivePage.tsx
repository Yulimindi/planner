import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { db } from '../db/db'
import { deleteMemo, setMemoFlag } from '../db/repo'
import { roleOf, useAccessMap, useAllCategories, useCategoryCounts, useCategoryMap } from '../lib/hooks'
import { Button, EmptyState, IconButton, PageHeader, Section, Spinner } from '../components/ui'
import { useFeedback } from '../components/ui/Feedback'
import { CategoryIconBadge } from '../components/category/CategoryForm'
import { useCategoryActions } from '../components/category/useCategoryActions'
import { CategoryTag } from '../components/memo/MemoParts'
import { CATEGORY_TYPE_LABEL } from '../db/types'
import { excerpt, formatDate } from '../lib/utils'

export default function ArchivePage() {
  const cats = useAllCategories()
  const catMap = useCategoryMap()
  const counts = useCategoryCounts()
  const memos = useLiveQuery(() => db.memos.orderBy('updatedAt').reverse().toArray(), [])
  const { restore, remove } = useCategoryActions()
  const access = useAccessMap()
  const { confirm, run } = useFeedback()

  const archivedCats = useMemo(() => cats?.filter((c) => c.archived && roleOf(access, c.id) === 'owner') ?? [], [cats, access])
  const archivedMemos = useMemo(() => memos?.filter((m) => m.archived) ?? [], [memos])

  if (!cats || !memos) return <Spinner />

  const removeMemo = async (id: string) => {
    const ok = await confirm({ title: '메모를 영구 삭제할까요?', message: '삭제한 메모와 이미지는 되돌릴 수 없어요.', confirmText: '삭제', danger: true })
    if (ok) await run(() => deleteMemo(id), '메모를 삭제했어요.')
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Archive" description="당장 필요하지 않은 카테고리와 메모를 보관해 두는 곳이에요. 언제든 복원할 수 있어요." />

      {archivedCats.length === 0 && archivedMemos.length === 0 && (
        <EmptyState icon={<Archive size={22} />} title="보관된 항목이 없어요" description="카테고리나 메모의 '보관' 버튼을 누르면 이곳으로 옮겨져요." />
      )}

      {archivedCats.length > 0 && (
        <Section title={`보관된 카테고리 ${archivedCats.length}`}>
          <div className="card divide-y divide-line">
            {archivedCats.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Link to={`/c/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <CategoryIconBadge cat={c} size={36} />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">{c.name}</p>
                    <p className="text-[12px] text-muted">{CATEGORY_TYPE_LABEL[c.type]} · 항목 {counts[c.id] ?? 0}개</p>
                  </div>
                </Link>
                <Button size="sm" icon={<ArchiveRestore size={15} />} onClick={() => restore(c)}>복원</Button>
                <IconButton label="영구 삭제" onClick={() => remove(c)}><Trash2 size={15} /></IconButton>
              </div>
            ))}
          </div>
        </Section>
      )}

      {archivedMemos.length > 0 && (
        <Section title={`보관된 메모 ${archivedMemos.length}`}>
          <div className="card divide-y divide-line">
            {archivedMemos.map((m) => {
              const cat = m.categoryId ? catMap.get(m.categoryId) : null
              return (
                <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Link to={`/memo/${m.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{m.title || excerpt(m.content, 40) || '제목 없음'}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
                      <CategoryTag cat={cat} />
                      <span>{formatDate(m.updatedAt)}</span>
                      {cat?.archived && <span>(카테고리도 보관됨)</span>}
                    </div>
                  </Link>
                  <Button size="sm" icon={<ArchiveRestore size={15} />} onClick={() => run(() => setMemoFlag(m.id, { archived: false }), '메모를 복원했어요.')}>
                    복원
                  </Button>
                  <IconButton label="영구 삭제" onClick={() => removeMemo(m.id)}><Trash2 size={15} /></IconButton>
                </div>
              )
            })}
          </div>
        </Section>
      )}
    </div>
  )
}
