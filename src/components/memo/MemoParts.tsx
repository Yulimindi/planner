import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Image as ImageIcon, ImagePlus, Link2, Loader2, Star, Tag, X } from 'lucide-react'
import { useImageUrl } from '../../lib/hooks'
import { cn, displayUrl, excerpt, isSafeUrl, mmdd, normalizeUrl, relativeTime } from '../../lib/utils'
import { getPastel, tagPastel, tint } from '../../lib/colors'
import { CategoryIcon } from '../../lib/icons'
import { saveImage, setMemoFlag } from '../../db/repo'
import { useFeedback } from '../ui/Feedback'
import { IconButton, Input } from '../ui'
import type { Category, Memo } from '../../db/types'

/* ── 이미지 ─────────────────────────────────────────────── */
export function StoredImage({ id, className, alt = '' }: { id: string | null | undefined; className?: string; alt?: string }) {
  const url = useImageUrl(id)
  if (!url) return <div className={cn('bg-side/60', className)} />
  return <img src={url} alt={alt} className={cn('object-cover', className)} loading="lazy" draggable={false} />
}

/** 파일 선택 → IndexedDB에 저장 후 id 반환 */
export function useImagePicker(onAdded: (ids: string[]) => void) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const { toast } = useFeedback()

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || !files.length) return
    setBusy(true)
    const ids: string[] = []
    for (const f of Array.from(files)) {
      try {
        ids.push(await saveImage(f))
      } catch (e) {
        toast(e instanceof Error ? e.message : '이미지를 저장하지 못했어요.', 'error')
      }
    }
    setBusy(false)
    if (ids.length) onAdded(ids)
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      multiple
      hidden
      onChange={(e) => {
        handleFiles(e.target.files)
        e.target.value = ''
      }}
    />
  )
  return { open: () => inputRef.current?.click(), input, busy, handleFiles }
}

export function ImageAttach({ ids, onChange, large }: { ids: string[]; onChange: (ids: string[]) => void; large?: boolean }) {
  const picker = useImagePicker((added) => onChange([...ids, ...added]))
  const [dragOver, setDragOver] = useState(false)
  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        setDragOver(false)
        picker.handleFiles(e.dataTransfer.files)
      }}
      className={cn('rounded-[var(--radius-card)] transition', dragOver && 'ring-2 ring-accent-soft')}
    >
      {picker.input}
      <div className={cn('grid gap-2', large ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-3')}>
        {ids.map((id, i) => (
          <div key={id} className="group relative aspect-square overflow-hidden rounded-[var(--radius-ctl)] border border-line">
            <StoredImage id={id} className="size-full" />
            <div className="absolute inset-x-1 top-1 flex justify-between opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
              {i > 0 ? (
                <button
                  type="button"
                  className="rounded-md bg-card/90 px-1.5 text-[11px] text-ink"
                  onClick={() => onChange([id, ...ids.filter((x) => x !== id)])}
                  title="대표 이미지로 지정"
                >
                  대표로
                </button>
              ) : (
                <span className="rounded-md bg-card/90 px-1.5 text-[11px] text-muted">대표</span>
              )}
              <button
                type="button"
                aria-label="이미지 삭제"
                className="flex size-6 items-center justify-center rounded-md bg-card/90 text-ink"
                onClick={() => onChange(ids.filter((x) => x !== id))}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={picker.open}
          disabled={picker.busy}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[var(--radius-ctl)] border border-dashed border-line-strong text-[12px] whitespace-nowrap text-muted transition hover:bg-hover hover:text-ink"
        >
          {picker.busy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
          이미지 추가
        </button>
      </div>
    </div>
  )
}

/* ── 태그 ───────────────────────────────────────────────── */
/** 태그마다 고정된 파스텔색 칩 */
export function TagChip({ tag, onRemove, hash = true }: { tag: string; onRemove?: () => void; hash?: boolean }) {
  const p = tagPastel(tag)
  return (
    <span className="chip max-w-36 truncate" style={{ background: `color-mix(in srgb, ${p.bg} var(--tint), var(--card-bg))`, color: p.fg }}>
      {hash ? '#' : ''}{tag}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`${tag} 태그 삭제`} className="hover:text-ink">
          <X size={12} />
        </button>
      )}
    </span>
  )
}

export function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [value, setValue] = useState('')
  const add = () => {
    const parts = value.split(/[,#]/).map((t) => t.trim()).filter(Boolean)
    if (!parts.length) return
    onChange([...new Set([...tags, ...parts.map((p) => p.slice(0, 30))])])
    setValue('')
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag size={15} className="text-muted" />
      {tags.map((t) => (
        <TagChip key={t} tag={t} onRemove={() => onChange(tags.filter((x) => x !== t))} />
      ))}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add()
          } else if (e.key === 'Backspace' && !value && tags.length) {
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={add}
        placeholder={tags.length ? '' : '태그 입력 후 Enter'}
        className="min-w-28 flex-1 bg-transparent py-1 text-[13px] outline-none placeholder:text-muted/70"
      />
    </div>
  )
}

/* ── URL ────────────────────────────────────────────────── */
export function SafeLink({ url, className, children }: { url: string; className?: string; children?: React.ReactNode }) {
  if (!isSafeUrl(url)) return <span className={className}>{children ?? url}</span>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className} onClick={(e) => e.stopPropagation()}>
      {children ?? displayUrl(url)}
    </a>
  )
}

export function UrlList({ urls, onChange }: { urls: string[]; onChange: (urls: string[]) => void }) {
  const [value, setValue] = useState('')
  const [err, setErr] = useState('')
  const add = () => {
    const u = normalizeUrl(value)
    if (!u) return
    if (!isSafeUrl(u)) {
      setErr('http(s)로 시작하는 올바른 주소를 입력해 주세요.')
      return
    }
    if (!urls.includes(u)) onChange([...urls, u])
    setValue('')
    setErr('')
  }
  return (
    <div className="space-y-2">
      {urls.map((u) => (
        <div key={u} className="flex items-center gap-2 rounded-[var(--radius-ctl)] border border-line px-3 py-2 text-[13px]">
          <Link2 size={14} className="shrink-0 text-muted" />
          <SafeLink url={u} className="min-w-0 flex-1 truncate text-ink underline-offset-2 hover:underline" />
          <ExternalLink size={13} className="shrink-0 text-muted" />
          <IconButton label="링크 삭제" className="size-6" onClick={() => onChange(urls.filter((x) => x !== u))}>
            <X size={14} />
          </IconButton>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => { setValue(e.target.value); setErr('') }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder="https://example.com"
          className="h-9"
        />
        <button type="button" onClick={add} className="shrink-0 rounded-[var(--radius-ctl)] border border-line px-3 text-[13px] text-muted hover:bg-hover hover:text-ink">
          추가
        </button>
      </div>
      {err && <p className="text-[12px] text-danger">{err}</p>}
    </div>
  )
}

/* ── 카드 / 목록 ────────────────────────────────────────── */
export function FavoriteButton({ memo, className }: { memo: Memo; className?: string }) {
  const { run } = useFeedback()
  return (
    <IconButton
      label={memo.favorite ? '즐겨찾기 해제' : '즐겨찾기'}
      className={className}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        run(() => setMemoFlag(memo.id, { favorite: !memo.favorite }))
      }}
    >
      <Star size={16} className={memo.favorite ? 'fill-[#E3C98F] text-[#C9A960]' : ''} />
    </IconButton>
  )
}

export function CategoryTag({ cat }: { cat: Category | null | undefined }) {
  if (!cat) return <span className="chip bg-side px-2.5 py-1 leading-4 text-muted">미분류</span>
  const p = getPastel(cat.color)
  return (
    <span className="chip max-w-36 truncate px-2.5 py-1 leading-4" style={{ background: `color-mix(in srgb, ${p.bg} var(--tint), var(--card-bg))`, color: p.fg }}>
      {cat.name}
    </span>
  )
}

export function MemoCard({ memo, category, showCategory }: { memo: Memo; category?: Category | null; showCategory?: boolean }) {
  const cover = memo.imageIds[0]
  return (
    <Link to={`/memo/${memo.id}`} className="card card-hover group flex flex-col overflow-hidden">
      {cover && <StoredImage id={cover} className="h-44 w-full" />}
      <div className="flex flex-1 flex-col px-5 pt-4 pb-4">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-[-0.01em] text-ink">{memo.title || '제목 없음'}</h3>
          <FavoriteButton memo={memo} className="-mt-1 -mr-2" />
        </div>
        {memo.content && <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-muted">{excerpt(memo.content, 140)}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
          {showCategory && <CategoryTag cat={category} />}
          {memo.tags.slice(0, 2).map((t) => <TagChip key={t} tag={t} hash={false} />)}
          {!cover && memo.imageIds.length > 0 && <ImageIcon size={14} className="text-muted" />}
          {memo.urls.length > 0 && <Link2 size={14} className="text-muted" />}
          <span className="ml-auto text-[13px] text-muted tabular-nums" title={relativeTime(memo.updatedAt)}>{mmdd(memo.updatedAt)}</span>
        </div>
      </div>
    </Link>
  )
}

/** 목록용 메모 행: 썸네일 · 제목/요약 · 색 칩 · 날짜 (+ 추가 동작) */
export function MemoListItem({ memo, cat, date, extra, chip }: {
  memo: Memo
  cat: Category | null
  /** 표시할 시각 (기본: 수정일) */
  date?: number
  extra?: React.ReactNode
  /** 칩 문구 (기본: 첫 태그 → 카테고리 이름) */
  chip?: string
}) {
  const label = chip ?? memo.tags[0] ?? cat?.name ?? '미분류'
  const c = tagPastel(label)
  const p = getPastel(cat?.color ?? 'sand')
  return (
    <div className="group -mx-2 flex items-center gap-4 rounded-[var(--radius-ctl)] px-2 py-3.5 transition hover:bg-hover">
      <Link to={`/memo/${memo.id}`} className="flex min-w-0 flex-1 items-center gap-4">
        {memo.imageIds[0] ? (
          <StoredImage id={memo.imageIds[0]} className="h-[56px] w-[78px] shrink-0 rounded-lg" />
        ) : (
          <span className="flex h-[56px] w-[78px] shrink-0 items-center justify-center rounded-lg" style={{ background: tint(cat?.color ?? 'sand'), color: p.fg }}>
            <CategoryIcon name={cat?.icon ?? 'note'} size={22} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15.5px] font-semibold tracking-[-0.01em] text-ink">{memo.title || excerpt(memo.content, 30) || '제목 없음'}</p>
          <p className="mt-1 truncate text-[13.5px] text-muted">{excerpt(memo.content, 70) || (cat ? cat.name : '내용 없음')}</p>
        </div>
        <span
          className="hidden max-w-28 shrink-0 truncate rounded-md px-2.5 py-1 text-[12.5px] leading-4 font-medium sm:inline-block"
          style={{ background: `color-mix(in srgb, ${c.bg} var(--tint), var(--card-bg))`, color: c.fg }}
        >
          {label}
        </span>
        <span className="w-12 shrink-0 text-right text-[13.5px] text-muted tabular-nums">{mmdd(date ?? memo.updatedAt)}</span>
      </Link>
      {extra}
    </div>
  )
}

export function MemoRow({ memo, category, showCategory, extra }: {
  memo: Memo
  category?: Category | null
  showCategory?: boolean
  extra?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 transition hover:bg-hover/60">
      <Link to={`/memo/${memo.id}`} className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-ink">{memo.title || excerpt(memo.content, 40) || '제목 없음'}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
          {showCategory && <CategoryTag cat={category} />}
          <span>{relativeTime(memo.updatedAt)}</span>
          {memo.title && memo.content && <span className="hidden truncate sm:inline">· {excerpt(memo.content, 60)}</span>}
        </div>
      </Link>
      {extra}
      <FavoriteButton memo={memo} />
    </div>
  )
}
