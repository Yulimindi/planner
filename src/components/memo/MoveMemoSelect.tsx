import { useNavigate } from 'react-router-dom'
import { FolderInput } from 'lucide-react'
import { useWritableCategories } from '../../lib/hooks'
import { moveMemoToCategory } from '../../db/repo'
import { useFeedback } from '../ui/Feedback'
import { Select } from '../ui'
import { CATEGORY_TYPE_LABEL, type Memo } from '../../db/types'
import { cn } from '../../lib/utils'

/** 메모를 다른 카테고리(또는 미분류)로 이동하는 드롭다운 */
export function MoveMemoSelect({ memo, className, compact, afterMove }: {
  memo: Memo
  className?: string
  compact?: boolean
  afterMove?: (targetId: string | null, converted: boolean) => void
}) {
  const cats = useWritableCategories() ?? []
  const { confirm, run } = useFeedback()
  const navigate = useNavigate()

  const onChange = async (value: string) => {
    const target = value === '__none__' ? null : (cats.find((c) => c.id === value) ?? null)
    if (value !== '__none__' && !target) return
    if ((target?.id ?? null) === memo.categoryId) return
    const converts = !!target && (target.type === 'table' || target.type === 'checklist')
    if (converts) {
      const ok = await confirm({
        title: `"${target.name}"(으)로 옮길까요?`,
        message:
          target.type === 'table'
            ? '표 형식 카테고리로 옮기면 메모가 새 행으로 변환돼요. 제목은 첫 번째 텍스트 열에, 본문은 두 번째 텍스트 열에 들어가며 태그는 유지되지 않아요.'
            : '체크리스트로 옮기면 메모 제목(없으면 첫 줄)이 새 항목으로 추가되고, 본문·이미지·태그는 유지되지 않아요.',
        confirmText: '변환하여 이동',
      })
      if (!ok) return
    }
    const done = await run(async () => {
      await moveMemoToCategory(memo.id, target)
      return true
    }, target ? `"${target.name}"(으)로 옮겼어요.` : '미분류로 옮겼어요.')
    if (!done) return
    if (afterMove) afterMove(target?.id ?? null, converts)
    else if (converts && target) navigate(`/c/${target.id}`)
  }

  const groups = (['note', 'gallery', 'table', 'checklist'] as const)
    .map((t) => ({ type: t, items: cats.filter((c) => c.type === t) }))
    .filter((g) => g.items.length)

  return (
    <label className={cn('relative inline-flex items-center', className)}>
      <FolderInput size={15} className="pointer-events-none absolute left-3 text-muted" />
      <Select
        value={memo.categoryId ?? '__none__'}
        onChange={(e) => onChange(e.target.value)}
        className={cn('pl-9', compact ? 'h-9 w-48 rounded-full! text-[13px]' : 'h-10 w-full min-w-56')}
        aria-label="카테고리 이동"
      >
        <option value="__none__">미분류 (Quick Memo)</option>
        {groups.map((g) => (
          <optgroup key={g.type} label={CATEGORY_TYPE_LABEL[g.type] + (g.type === 'table' || g.type === 'checklist' ? ' (변환)' : '')}>
            {g.items.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        ))}
      </Select>
    </label>
  )
}
