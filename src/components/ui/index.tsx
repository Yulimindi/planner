import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

/* ── Button ─────────────────────────────────────────────── */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-card hover:opacity-90 border border-transparent',
  secondary: 'bg-card text-ink border border-line hover:bg-hover',
  ghost: 'bg-transparent text-muted hover:text-ink hover:bg-hover border border-transparent',
  danger: 'bg-danger-soft text-danger border border-transparent hover:brightness-95',
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
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-medium transition disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-[14px]',
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
        'inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-hover hover:text-ink disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft',
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
      <span className="text-[13px] font-medium text-ink">{children}</span>
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
      <div className="absolute inset-0 bg-[#4F4B47]/25 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panelRef}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-card shadow-xl sm:rounded-3xl',
          width,
        )}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
            <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
            <IconButton label="닫기" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </div>
        )}
        <div className="overflow-y-auto px-6 pb-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ── Misc ───────────────────────────────────────────────── */
export function EmptyState({ icon, title, description, action }: {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      {icon && <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-side text-muted">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, description, icon, actions }: {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-semibold tracking-tight text-ink sm:text-[26px]">{title}</h1>
          {description && <p className="mt-0.5 text-[14px] text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
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
    <div className="inline-flex rounded-xl border border-line bg-side/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px] transition',
            value === o.value ? 'bg-card text-ink shadow-soft' : 'text-muted hover:text-ink',
          )}
        >
          {o.icon}
          <span className={o.icon ? 'hidden sm:inline' : undefined}>{o.label}</span>
        </button>
      ))}
    </div>
  )
}
