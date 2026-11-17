import { useEffect, useState } from 'react'
import { CalendarDays, Check, CheckSquare, FileText, Image as ImageIcon, Table2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Label, Modal, Textarea } from '../ui'
import { useFeedback } from '../ui/Feedback'
import { CategoryIcon, ICON_NAMES } from '../../lib/icons'
import { PASTELS, getPastel } from '../../lib/colors'
import { cn } from '../../lib/utils'
import { changeCategoryType, createCategory, ensureTableColumns, updateCategory } from '../../db/repo'
import { categoryTypes, type Category, type CategoryType } from '../../db/types'

const TYPES: { type: CategoryType; label: string; desc: string; icon: React.ReactNode }[] = [
  { type: 'note', label: '일반 메모', desc: '제목·본문 중심의 자유 기록', icon: <FileText size={18} /> },
  { type: 'table', label: '표 / 데이터베이스', desc: '열과 행을 직접 구성하는 표', icon: <Table2 size={18} /> },
  { type: 'checklist', label: '체크리스트', desc: '완료 체크와 진행률', icon: <CheckSquare size={18} /> },
  { type: 'gallery', label: '갤러리', desc: '이미지와 설명 카드', icon: <ImageIcon size={18} /> },
  { type: 'calendar', label: '캘린더', desc: '월별 달력에 일정 기록', icon: <CalendarDays size={18} /> },
]

export function CategoryIconBadge({ cat, size = 40 }: { cat: Pick<Category, 'icon' | 'color'>; size?: number }) {
  const p = getPastel(cat.color)
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: `color-mix(in srgb, color-mix(in srgb, ${p.fg} 10%, ${p.bg}) var(--tint), var(--card-bg))`, color: p.fg }}
    >
      <CategoryIcon name={cat.icon} size={Math.round(size * 0.46)} />
    </span>
  )
}

export function CategoryFormModal({ open, onClose, category }: {
  open: boolean
  onClose: () => void
  /** 지정하면 수정 모드 */
  category?: Category
}) {
  const { run } = useFeedback()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('sparkles')
  const [color, setColor] = useState('lavender')
  /** 고른 형식들. 맨 앞이 기본 형식 */
  const [types, setTypes] = useState<CategoryType[]>(['note'])
  const [error, setError] = useState('')
  const type = types[0]
  const toggleType = (t: CategoryType) =>
    setTypes((cur) => (cur.includes(t) ? (cur.length > 1 ? cur.filter((x) => x !== t) : cur) : [...cur, t]))
  const makePrimary = (t: CategoryType) => setTypes((cur) => [t, ...cur.filter((x) => x !== t)])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(category?.name ?? '')
    setDescription(category?.description ?? '')
    setIcon(category?.icon ?? 'sparkles')
    setColor(category?.color ?? PASTELS[Math.floor(Math.random() * PASTELS.length)].id)
    setTypes(category ? categoryTypes(category) : ['note'])
    setError('')
  }, [open, category])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('카테고리 이름을 입력해 주세요.')
      return
    }
    if (name.trim().length > 40) {
      setError('이름은 40자 이내로 입력해 주세요.')
      return
    }
    setSaving(true)
    const data = { name: name.trim(), description: description.trim(), icon, color, extraTypes: types.slice(1), calendar: false }
    if (category) {
      await run(async () => {
        if (type !== category.type) await changeCategoryType(category.id, type)
        if (types.includes('table')) await ensureTableColumns(category.id)
        await updateCategory(category.id, data)
      }, '카테고리를 수정했어요.')
      setSaving(false)
      onClose()
    } else {
      const id = await run(() => createCategory({ ...data, type }), '새 카테고리를 만들었어요.')
      setSaving(false)
      if (id) {
        onClose()
        navigate(`/c/${id}`)
      }
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? '카테고리 수정' : '새 카테고리'}
      width="max-w-xl"
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" type="submit" form="category-form" disabled={saving}>
            {category ? '저장' : '만들기'}
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} className="space-y-5">
        <div className="flex items-center gap-3 rounded-[var(--radius-card)] bg-side/50 p-3">
          <CategoryIconBadge cat={{ icon, color }} size={44} />
          <div className="min-w-0">
            <p className="truncate font-medium">{name.trim() || '카테고리 이름'}</p>
            <p className="truncate text-[13px] text-muted">{description.trim() || '설명이 여기에 표시돼요'}</p>
          </div>
        </div>

        <div>
          <Label>이름</Label>
          <Input
            value={name}
            onChange={(e) => { setName(e.target.value); setError('') }}
            placeholder="예: 읽고 싶은 책"
            autoFocus
            maxLength={40}
          />
          {error && <p className="mt-1 text-[12px] text-danger">{error}</p>}
        </div>

        <div>
          <Label hint="선택">설명</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16" placeholder="이 카테고리에 대한 짧은 설명" maxLength={200} />
        </div>

        <div>
          <Label hint="여러 개 선택 가능">데이터 관리 형식</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TYPES.map((t) => {
              const on = types.includes(t.type)
              const primary = type === t.type
              return (
                <div
                  key={t.type}
                  className={cn(
                    'relative flex rounded-[var(--radius-ctl)] border transition',
                    on ? 'border-accent/60 bg-accent-soft/60' : 'border-line hover:bg-hover',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleType(t.type)}
                    aria-pressed={on}
                    className={cn('flex min-w-0 flex-1 items-start gap-3 p-3 text-left', on && types.length > 1 && 'pr-20')}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border',
                        on ? 'border-transparent bg-primary text-primary-ink' : 'border-line-strong text-transparent',
                      )}
                    >
                      <Check size={13} strokeWidth={3} />
                    </span>
                    <span className="mt-0.5 text-muted">{t.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium">{t.label}</span>
                      <span className="block text-[12px] text-muted">{t.desc}</span>
                    </span>
                  </button>
                  {on && types.length > 1 && (
                    primary ? (
                      <span className="absolute top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-ink">기본</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => makePrimary(t.type)}
                        className="absolute top-2 right-2 rounded-full border border-line bg-card/80 px-2 py-0.5 text-[11px] text-muted hover:text-ink"
                      >
                        기본으로
                      </button>
                    )
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            고른 형식이 한 페이지에 함께 보여요. <b className="font-medium text-ink-2">기본</b> 형식이 맨 위에 보이고 항목 개수의 기준이 돼요.
            {types.includes('calendar') && types.includes('checklist') ? ' 목표 날짜가 있는 할 일은 달력에도 보여요.' : ''}
          </p>
          {category && categoryTypes(category).some((t) => !types.includes(t)) && (
            <p className="mt-2 rounded-[var(--radius-ctl)] bg-side/60 px-3 py-2 text-[12.5px] leading-relaxed text-muted">
              형식을 빼도 지금까지 기록한 데이터는 지워지지 않아요. 다시 그 형식을 고르면 그대로 보여요.
            </p>
          )}
        </div>

        <div>
          <Label>포인트 컬러</Label>
          <div className="flex flex-wrap gap-2">
            {PASTELS.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.name}
                aria-label={p.name}
                onClick={() => setColor(p.id)}
                className={cn('size-9 rounded-full border-2 transition', color === p.id ? 'scale-110 border-ink/40' : 'border-transparent')}
                style={{ background: p.bg }}
              />
            ))}
          </div>
        </div>

        <div>
          <Label>아이콘</Label>
          <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-11">
            {ICON_NAMES.map((n) => (
              <button
                key={n}
                type="button"
                aria-label={n}
                onClick={() => setIcon(n)}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-lg border transition',
                  icon === n ? 'border-accent/60 bg-accent-soft text-ink' : 'border-transparent text-muted hover:bg-hover',
                )}
              >
                <CategoryIcon name={n} size={18} />
              </button>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  )
}
