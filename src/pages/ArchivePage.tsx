import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ArchiveRestore, FileText, FolderOpen, Trash2 } from 'lucide-react'
import { db } from '../db/db'
import { deleteMemo, setMemoFlag } from '../db/repo'
import { roleOf, useAccessMap, useAllCategories, useCategoryCounts, useCategoryMap } from '../lib/hooks'
import { Button, EmptyState, IconButton, PageHeader, Panel, Spinner } from '../components/ui'
import { useFeedback } from '../components/ui/Feedback'
import { CategoryIconBadge } from '../components/category/CategoryForm'
import { useCategoryActions } from '../components/category/useCategoryActions'
import { MemoListItem } from '../components/memo/MemoParts'
import { CATEGORY_TYPE_LABEL } from '../db/types'
import { cn } from '../lib/utils'

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
    <div>
      <PageHeader
        eyebrow={<><Archive size={17} strokeWidth={1.6} /> 카테고리 {archivedCats.length}개 · 메모 {archivedMemos.length}개 보관 중</>}
        title="Archive"
        description="당장 필요하지 않은 카테고리와 메모를 보관해 두는 곳이에요. 언제든 복원할 수 있어요."
      />

      {archivedCats.length === 0 && archivedMemos.length === 0 && (
        <EmptyState icon={<Archive size={22} />} title="보관된 항목이 없어요" description="카테고리나 메모의 '보관' 버튼을 누르면 이곳으로 옮겨져요." />
      )}

      <div className={cn('grid items-start gap-6', archivedCats.length > 0 && archivedMemos.length > 0 && 'lg:grid-cols-2')}>
        {archivedCats.length > 0 && (
          <Panel icon={<FolderOpen size={20} strokeWidth={1.6} className="text-muted" />} title="보관된 카테고리" action={<span className="text-[13.5px] text-muted">{archivedCats.length}개</span>}>
            <div className="divide-y divide-line">
              {archivedCats.map((c) => (
                <div key={c.id} className="-mx-2 flex items-center gap-4 rounded-[var(--radius-ctl)] px-2 py-3.5 transition hover:bg-hover">
                  <Link to={`/c/${c.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                    <CategoryIconBadge cat={c} size={48} />
                    <div className="min-w-0">
                      <p className="truncate text-[15.5px] font-semibold tracking-[-0.01em]">{c.name}</p>
                      <p className="mt-0.5 text-[13.5px] text-muted">{CATEGORY_TYPE_LABEL[c.type]} · {counts[c.id] ?? 0}개</p>
                    </div>
                  </Link>
                  <Button size="sm" icon={<ArchiveRestore size={15} />} onClick={() => restore(c)}>복원</Button>
                  <IconButton label="영구 삭제" className="hover:text-danger" onClick={() => remove(c)}><Trash2 size={16} /></IconButton>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {archivedMemos.length > 0 && (
          <Panel icon={<FileText size={20} strokeWidth={1.6} className="text-muted" />} title="보관된 메모" action={<span className="text-[13.5px] text-muted">{archivedMemos.length}개</span>}>
            <div className="divide-y divide-line">
              {archivedMemos.map((m) => (
                <MemoListItem
                  key={m.id}
                  memo={m}
                  cat={m.categoryId ? (catMap.get(m.categoryId) ?? null) : null}
                  extra={
                    <div className="flex shrink-0 items-center">
                      <IconButton label="복원" onClick={() => run(() => setMemoFlag(m.id, { archived: false }), '메모를 복원했어요.')}><ArchiveRestore size={16} /></IconButton>
                      <IconButton label="영구 삭제" className="hover:text-danger" onClick={() => removeMemo(m.id)}><Trash2 size={16} /></IconButton>
                    </div>
                  }
                />
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}
