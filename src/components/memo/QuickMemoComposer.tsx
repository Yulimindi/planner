import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button, Input, Modal, Textarea } from '../ui'
import { useFeedback } from '../ui/Feedback'
import { createMemo } from '../../db/repo'

/** 제목(선택) + 내용만으로 빠르게 메모를 남기는 입력 폼 */
export function QuickMemoComposer({ onSaved, autoFocus }: { onSaved?: () => void; autoFocus?: boolean }) {
  const { run } = useFeedback()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  const save = async () => {
    if (!title.trim() && !content.trim()) return
    const id = await run(() => createMemo(null, { title: title.trim(), content: content.trim() }), '빠른 메모를 저장했어요.')
    if (id) {
      setTitle('')
      setContent('')
      onSaved?.()
    }
  }

  return (
    <form
      className="card space-y-2 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목 (선택)"
        className="border-transparent px-1 text-[15px] font-medium focus:border-transparent focus:ring-0"
        maxLength={120}
      />
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="떠오른 생각을 적어보세요…  (Ctrl/⌘ + Enter로 저장)"
        className="min-h-20 border-transparent px-1 focus:border-transparent focus:ring-0"
        autoFocus={autoFocus}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            save()
          }
        }}
      />
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="sm" icon={<Send size={14} />} disabled={!title.trim() && !content.trim()}>
          저장
        </Button>
      </div>
    </form>
  )
}

export function QuickMemoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="빠른 메모">
      <p className="mb-3 text-[13px] text-muted">카테고리 없이 일단 기록해 두고, 나중에 Quick Memo에서 원하는 곳으로 옮길 수 있어요.</p>
      <QuickMemoComposer onSaved={onClose} autoFocus />
    </Modal>
  )
}
