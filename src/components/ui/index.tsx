import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

/* ── Button ─────────────────────────────────────────────── */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-ink border border-transparent shadow-[0_4px_14px_rgb(196_143_137/0.3)] hover:bg-primary-hover',
  secondary: 'bg-card text-ink-2 border border-line-strong hover:bg-hover hover:text-ink',
  ghost: 'bg-transparent text-muted hover:text-ink hover:bg-hover border border-transparent',
  danger: 'bg-danger-soft text-danger border border-transparent hover:brightness-[0.97]',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-medium transition disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent-soft',
        size === 'sm' ? 'h-9 px-4 text-[13px]' : 'h-11 px-5 text-[14px]',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
})

export function IconButton({
  label, className, children, active, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-hover hover:text-ink disabled:opacity-40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent-soft',
        active && 'bg-hover text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ── Inputs ─────────────────────────────────────────────── */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest }, ref,
) {
  return <input ref={ref} className={cn('field h-10', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest }, ref,
) {
  return <textarea ref={ref} className={cn('field min-h-24 resize-y leading-relaxed', className)} {...rest} />
})

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn('field field-select h-10 cursor-pointer pr-9', className)}
      {...rest}
    >
      {children}
    </select>
  )
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="text-[13px] font-medium text-ink-2">{children}</span>
      {hint && <span className="text-[12px] text-muted">{hint}</span>}
    </div>
  )
}

/* ── Modal ──────────────────────────────────────────────── */
export function Modal({
  open, onClose, title, children, footer, width = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[#2f2b28]/30 backdrop-blur-[1.5px]" onClick={onClose} />
      <div
        ref={panelRef}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col rounded-t-[18px] border border-line bg-card shadow-[0_24px_64px_rgb(47_43_40/0.18)] sm:rounded-[18px]',
          width,
        )}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-4">
            <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
            <IconButton label="닫기" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </div>
        )}
        <div className="overflow-y-auto px-6 pb-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 rounded-b-[18px] border-t border-line bg-side/40 px-6 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ── Misc ───────────────────────────────────────────────── */
/** 섹션 우측 '전체 보기 →' 같은 텍스트 링크 스타일 */
export const linkCls = 'inline-flex items-center gap-1 text-[13px] font-medium text-muted transition hover:text-ink'

export function EmptyState({ icon, title, description, action }: {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line-strong bg-card/60 px-6 py-16 text-center">
      {icon && <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">{icon}</div>}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, description, icon, actions, eyebrow }: {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  /** 제목 위 작은 줄 (아이콘 + 짧은 설명) */
  eyebrow?: ReactNode
}) {
  return (
    <header className="mb-9">
      {eyebrow && <p className="mb-4 flex items-center gap-2.5 text-[14.5px] text-ink-2/80">{eyebrow}</p>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {icon}
          <div className="min-w-0">
            <h1 className="t-title truncate">{title}</h1>
            {description && <p className="mt-2 text-[15.5px] text-ink-2/80">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

/** 흰 카드 패널: 아이콘 + 제목 + 우측 링크/버튼 */
export function Panel({ icon, title, action, children, className, bodyClassName }: {
  icon?: ReactNode
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('card flex flex-col px-6 pt-5 pb-3 sm:px-7', className)}>
      {(title || action) && (
        <div className="mb-2 flex min-h-9 items-center justify-between gap-3">
          {title && (
            <h2 className="t-section flex items-center gap-3">
              {icon}
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

/** 원형 아이콘 배경 */
export function Bubble({ bg, fg, size = 44, children, className }: { bg: string; fg: string; size?: number; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full', className)}
      style={{ width: size, height: size, background: `color-mix(in srgb, color-mix(in srgb, ${fg} 10%, ${bg}) var(--tint), var(--card-bg))`, color: fg }}
    >
      {children}
    </span>
  )
}

export function Section({ title, icon, action, children }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="t-section flex items-center gap-2">
          {icon && <span className="text-muted">{icon}</span>}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Spinner() {
  return <div className="flex justify-center py-16 text-[13px] text-muted">불러오는 중…</div>
}

export function Segmented<T extends string>({ value, onChange, options }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: ReactNode }[]
}) {
  return (
    <div className="inline-flex rounded-[var(--radius-ctl)] border border-line bg-side p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'inline-flex h-[30px] items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-medium transition',
            value === o.value ? 'bg-card text-ink shadow-soft ring-1 ring-line' : 'text-muted hover:text-ink',
          )}
        >
          {o.icon}
          <span className={o.icon ? 'hidden sm:inline' : undefined}>{o.label}</span>
        </button>
      ))}
    </div>
  )
}
