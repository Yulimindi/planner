import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button, Modal } from './index'
import { cn } from '../../lib/utils'

interface Toast {
  id: number
  message: string
  kind: 'success' | 'error'
}

interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

interface FeedbackCtx {
  toast: (message: string, kind?: Toast['kind']) => void
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  /** 비동기 작업 실행 후 실패 시 오류 토스트 */
  run: <T>(fn: () => Promise<T>, success?: string) => Promise<T | undefined>
}

const Ctx = createContext<FeedbackCtx | null>(null)

export function useFeedback(): FeedbackCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('FeedbackProvider가 필요합니다.')
  return c
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)
  const seq = useRef(0)

  const toast = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    const id = ++seq.current
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 4500 : 2600)
  }, [])

  const confirm = useCallback((opts: ConfirmOptions) => {
    setConfirmState(opts)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = (v: boolean) => {
    resolver.current?.(v)
    resolver.current = null
    setConfirmState(null)
  }

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string) => {
      try {
        const r = await fn()
        if (success) toast(success)
        return r
      } catch (e) {
        console.error(e)
        toast(e instanceof Error ? e.message : '작업 중 오류가 발생했습니다.', 'error')
        return undefined
      }
    },
    [toast],
  )

  return (
    <Ctx.Provider value={{ toast, confirm, run }}>
      {children}
      <Modal
        open={!!confirmState}
        onClose={() => close(false)}
        title={confirmState?.title}
        width="max-w-md"
        footer={
          <>
            <Button onClick={() => close(false)}>{confirmState?.cancelText ?? '취소'}</Button>
            <Button variant={confirmState?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {confirmState?.confirmText ?? '확인'}
            </Button>
          </>
        }
      >
        <div className="text-[14px] leading-relaxed text-muted">{confirmState?.message}</div>
      </Modal>
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className={cn(
                'pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl border px-4 py-2.5 text-[14px] shadow-lg',
                t.kind === 'error' ? 'border-danger/30 bg-danger-soft text-danger' : 'border-line bg-card text-ink',
              )}
            >
              {t.kind === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} className="text-accent" />}
              {t.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  )
}
