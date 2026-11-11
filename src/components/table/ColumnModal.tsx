import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react'
import { Button, IconButton, Input, Label, Modal, Select } from '../ui'
import { useFeedback } from '../ui/Feedback'
import { addColumn, deleteColumn, reorderColumns, updateColumn } from '../../db/repo'
import { COLUMN_TYPE_LABEL, type Aggregate, type Column, type ColumnType, type SelectOption } from '../../db/types'
import { PASTELS, getPastel } from '../../lib/colors'
import { moveItem, uid } from '../../lib/utils'
import { AGG_LABEL } from './cells'

const TYPES = Object.keys(COLUMN_TYPE_LABEL) as ColumnType[]

/**
 * 열 추가/설정 모달. column이 없으면 새 열 추가.
 */
export function ColumnModal({ open, onClose, categoryId, column, columns }: {
  open: boolean
  onClose: () => void
  categoryId: string
  column?: Column
  columns: Column[]
}) {
  const { confirm, run } = useFeedback()
  const [name, setName] = useState('')
  const [type, setType] = useState<ColumnType>('text')
  const [options, setOptions] = useState<SelectOption[]>([])
  const [agg, setAgg] = useState<Aggregate>('none')
  const [newOpt, setNewOpt] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setName(column?.name ?? '')
    setType(column?.type ?? 'text')
    setOptions(column?.options ?? [])
    setAgg(column?.aggregate ?? 'none')
    setNewOpt('')
    setErr('')
  }, [open, column])

  const idx = column ? columns.findIndex((c) => c.id === column.id) : -1
  const ids = columns.map((c) => c.id)

  const addOption = () => {
    const label = newOpt.trim()
    if (!label) return
    if (options.some((o) => o.label === label)) {
      setErr('이미 있는 선택지예요.')
      return
    }
    setOptions([...options, { id: uid(), label, color: PASTELS[options.length % PASTELS.length].id }])
    setNewOpt('')
    setErr('')
  }

  const save = async () => {
    const n = name.trim()
    if (!n) {
      setErr('열 이름을 입력해 주세요.')
      return
    }
    const cleanOpts = options.map((o) => ({ ...o, label: o.label.trim() })).filter((o) => o.label)
    if (column) {
      if (column.type !== type) {
        const ok = await confirm({
          title: '열 유형을 바꿀까요?',
          message: type === 'image' || column.type === 'image'
            ? '이미지 열로/에서 바꾸면 이 열의 기존 값이 모두 지워져요.'
            : `기존 값이 "${COLUMN_TYPE_LABEL[type]}" 유형에 맞게 변환되며, 변환할 수 없는 값은 비워져요.`,
          confirmText: '변경',
        })
        if (!ok) return
      }
      const patch: Partial<Column> = { name: n, type, aggregate: type === 'number' ? agg : 'none' }
      if (type === 'select') patch.options = cleanOpts
      const done = await run(async () => { await updateColumn(column.id, patch); return true })
      if (done) onClose()
    } else {
      const done = await run(async () => {
        const id = await addColumn(categoryId, n, type)
        await updateColumn(id, { options: type === 'select' ? cleanOpts : [], aggregate: type === 'number' ? agg : 'none' })
        return true
      }, '열을 추가했어요.')
      if (done) onClose()
    }
  }

  const remove = async () => {
    if (!column) return
    if (columns.length <= 1) {
      await confirm({ title: '열을 삭제할 수 없어요', message: '표에는 최소 한 개의 열이 필요해요.', confirmText: '확인' })
      return
    }
    const ok = await confirm({
      title: `"${column.name}" 열을 삭제할까요?`,
      message: '이 열에 입력된 모든 값이 함께 삭제되며 되돌릴 수 없어요.',
      confirmText: '열 삭제',
      danger: true,
    })
    if (!ok) return
    const done = await run(async () => { await deleteColumn(column.id); return true }, '열을 삭제했어요.')
    if (done) onClose()
  }

  const move = (dir: -1 | 1) => run(() => reorderColumns(moveItem(ids, idx, idx + dir)))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={column ? '열 설정' : '열 추가'}
      footer={
        <>
          {column && (
            <Button variant="danger" icon={<Trash2 size={15} />} onClick={remove} className="mr-auto">
              열 삭제
            </Button>
          )}
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={save}>{column ? '저장' : '추가'}</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Label>열 이름</Label>
          <Input value={name} onChange={(e) => { setName(e.target.value); setErr('') }} autoFocus maxLength={40} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="예: 가격" />
        </div>
        <div>
          <Label>데이터 유형</Label>
          <Select value={type} onChange={(e) => setType(e.target.value as ColumnType)}>
            {TYPES.map((t) => <option key={t} value={t}>{COLUMN_TYPE_LABEL[t]}</option>)}
          </Select>
        </div>

        {type === 'number' && (
          <div>
            <Label hint="표 하단에 표시돼요">계산</Label>
            <Select value={agg} onChange={(e) => setAgg(e.target.value as Aggregate)}>
              {(Object.keys(AGG_LABEL) as Aggregate[]).map((a) => <option key={a} value={a}>{AGG_LABEL[a]}</option>)}
            </Select>
          </div>
        )}

        {type === 'select' && (
          <div>
            <Label hint={column?.type !== 'select' && column ? '비워두면 기존 값으로 자동 생성' : undefined}>선택지</Label>
            <ul className="mb-2 space-y-1.5">
              {options.map((o, i) => {
                const p = getPastel(o.color)
                return (
                  <li key={o.id} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      title="색상 변경"
                      aria-label="색상 변경"
                      className="size-7 shrink-0 rounded-full border border-line"
                      style={{ background: p.bg }}
                      onClick={() => {
                        const next = PASTELS[(PASTELS.findIndex((x) => x.id === o.color) + 1) % PASTELS.length].id
                        setOptions(options.map((x) => (x.id === o.id ? { ...x, color: next } : x)))
                      }}
                    />
                    <Input
                      value={o.label}
                      onChange={(e) => setOptions(options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))}
                      className="h-9"
                      maxLength={30}
                    />
                    <IconButton label="위로" disabled={i === 0} onClick={() => setOptions(moveItem(options, i, i - 1))}><ChevronUp size={15} /></IconButton>
                    <IconButton label="아래로" disabled={i === options.length - 1} onClick={() => setOptions(moveItem(options, i, i + 1))}><ChevronDown size={15} /></IconButton>
                    <IconButton label="선택지 삭제" onClick={() => setOptions(options.filter((x) => x.id !== o.id))}><X size={15} /></IconButton>
                  </li>
                )
              })}
            </ul>
            <div className="flex gap-2">
              <Input
                value={newOpt}
                onChange={(e) => { setNewOpt(e.target.value); setErr('') }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addOption()
                  }
                }}
                placeholder="새 선택지"
                className="h-9"
                maxLength={30}
              />
              <Button size="sm" icon={<Plus size={14} />} onClick={addOption} className="h-9">추가</Button>
            </div>
            <p className="mt-1.5 text-[12px] text-muted">색상 원을 누르면 색이 바뀌어요. 선택지를 삭제하면 해당 값이 입력된 셀은 비워져요.</p>
          </div>
        )}

        {err && <p className="text-[12px] text-danger">{err}</p>}

        {column && columns.length > 1 && (
          <div>
            <Label>열 순서</Label>
            <div className="flex gap-2">
              <Button size="sm" icon={<ArrowLeft size={14} />} disabled={idx <= 0} onClick={() => move(-1)}>왼쪽으로</Button>
              <Button size="sm" icon={<ArrowRight size={14} />} disabled={idx >= columns.length - 1} onClick={() => move(1)}>오른쪽으로</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
