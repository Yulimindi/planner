import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PenLine, Trash2 } from 'lucide-react'
import { db } from '../db/db'
import { deleteMemo } from '../db/repo'
import { EmptyState, IconButton, PageHeader, Spinner } from '../components/ui'
import { useFeedback } from '../components/ui/Feedback'
import { QuickMemoComposer } from '../components/memo/QuickMemoComposer'
import { MemoRow } from '../components/memo/MemoParts'
import { MoveMemoSelect } from '../components/memo/MoveMemoSelect'

export default function QuickMemoPage() {
  const all = useLiveQuery(() => db.memos.orderBy('createdAt').reverse().toArray(), [])
  const memos = useMemo(() => all?.filter((m) => m.categoryId === null && !m.archived), [all])
  const { confirm, run } = useFeedback()

  const remove = async (id: string) => {
    const ok = await confirm({ title: '메모를 삭제할까요?', message: '삭제한 메모는 되돌릴 수 없어요.', confirmText: '삭제', danger: true })
    if (ok) await run(() => deleteMemo(id), '메모를 삭제했어요.')
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Quick Memo" description="카테고리 없이 일단 적어두는 공간이에요. 나중에 원하는 카테고리로 옮길 수 있어요." />
      <QuickMemoComposer />
      <div className="mt-8">
        {!memos ? (
          <Spinner />
        ) : memos.length === 0 ? (
          <EmptyState icon={<PenLine size={22} />} title="미분류 메모가 없어요" description="위 입력창에 떠오른 생각을 바로 적어보세요." />
        ) : (
          <>
            <p className="mb-2 text-[13px] text-muted">미분류 메모 {memos.length}개</p>
            <div className="card divide-y divide-line">
              {memos.map((m) => (
                <MemoRow
                  key={m.id}
                  memo={m}
                  extra={
                    <div className="hidden items-center gap-1 sm:flex">
                      <MoveMemoSelect memo={m} compact afterMove={() => {}} />
                      <IconButton label="삭제" onClick={() => remove(m.id)}>
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  }
                />
              ))}
            </div>
            <p className="mt-2 text-[12px] text-muted sm:hidden">메모를 눌러 수정하거나 카테고리로 옮길 수 있어요.</p>
          </>
        )}
      </div>
    </div>
  )
}
