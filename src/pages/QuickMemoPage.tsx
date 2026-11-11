import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Inbox, Pencil, PenLine, Trash2 } from 'lucide-react'
import { db } from '../db/db'
import { deleteMemo } from '../db/repo'
import { EmptyState, IconButton, PageHeader, Panel, Spinner } from '../components/ui'
import { useFeedback } from '../components/ui/Feedback'
import { QuickMemoComposer } from '../components/memo/QuickMemoComposer'
import { MemoListItem } from '../components/memo/MemoParts'
import { MoveMemoSelect } from '../components/memo/MoveMemoSelect'
import { getPastel, wash, washLine } from '../lib/colors'

export default function QuickMemoPage() {
  const all = useLiveQuery(() => db.memos.orderBy('createdAt').reverse().toArray(), [])
  const memos = useMemo(() => all?.filter((m) => m.categoryId === null && !m.archived), [all])
  const { confirm, run } = useFeedback()

  const remove = async (id: string) => {
    const ok = await confirm({ title: '메모를 삭제할까요?', message: '삭제한 메모는 되돌릴 수 없어요.', confirmText: '삭제', danger: true })
    if (ok) await run(() => deleteMemo(id), '메모를 삭제했어요.')
  }

  return (
    <div>
      <PageHeader
        eyebrow={<><PenLine size={17} strokeWidth={1.6} /> 카테고리 없이 바로 기록</>}
        title="Quick Memo"
        description="떠오른 생각을 일단 적어두고, 나중에 원하는 카테고리로 옮겨보세요."
      />

      {/* 작성 영역: 홈의 빠른 메모 배너와 같은 톤 */}
      <section
        className="mb-10 rounded-[var(--radius-card)] border px-5 py-5 sm:px-7 sm:py-6"
        style={{ background: wash('pink'), borderColor: washLine('pink') }}
      >
        <div className="mb-4 flex items-center gap-3">
          <Pencil size={26} strokeWidth={1.4} style={{ color: getPastel('pink').fg }} />
          <div>
            <p className="text-[16.5px] font-semibold text-ink">새 빠른 메모</p>
            <p className="text-[13px] text-muted">제목은 비워도 괜찮아요. Ctrl/⌘ + Enter로 바로 저장돼요.</p>
          </div>
        </div>
        <QuickMemoComposer />
      </section>

      {!memos ? (
        <Spinner />
      ) : memos.length === 0 ? (
        <EmptyState icon={<Inbox size={22} />} title="미분류 메모가 없어요" description="위 입력창에 떠오른 생각을 바로 적어보세요." />
      ) : (
        <Panel
          icon={<Inbox size={20} strokeWidth={1.6} className="text-muted" />}
          title="미분류 메모"
          action={<span className="text-[13.5px] text-muted">{memos.length}개</span>}
        >
          <div className="divide-y divide-line">
            {memos.map((m) => (
              <MemoListItem
                key={m.id}
                memo={m}
                cat={null}
                date={m.createdAt}
                extra={
                  <div className="hidden items-center gap-1 md:flex">
                    <MoveMemoSelect memo={m} compact afterMove={() => {}} />
                    <IconButton label="삭제" className="hover:text-danger" onClick={() => remove(m.id)}>
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                }
              />
            ))}
          </div>
          <p className="py-2 text-[12px] text-muted md:hidden">메모를 눌러 수정하거나 카테고리로 옮길 수 있어요.</p>
        </Panel>
      )}
    </div>
  )
}
