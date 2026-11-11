/**
 * 미니 쪽지창 띄우기
 * - Chrome/Edge: Document Picture-in-Picture로 다른 창 위에 항상 떠 있는 작은 창
 * - 지원하지 않는 브라우저: 페이지 오른쪽 아래 작은 패널
 */
import { useEffect, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { useNavigate } from 'react-router-dom'
import { MiniMailbox } from './MiniMailbox'
import { useSettings } from '../../lib/hooks'

type Mode = 'closed' | 'pip' | 'inline'
const WIDTH = 300
const HEIGHT = 420

interface DocumentPip {
  requestWindow(opts: { width: number; height: number }): Promise<Window>
  window: Window | null
}
const docPip = (): DocumentPip | undefined => (window as unknown as { documentPictureInPicture?: DocumentPip }).documentPictureInPicture

let mode: Mode = 'closed'
let pipWin: Window | null = null
const listeners = new Set<() => void>()
const setMode = (m: Mode) => {
  mode = m
  listeners.forEach((l) => l())
}

export const supportsFloatingWindow = () => !!docPip()

/** 본 창의 스타일을 미니 창에도 복사 (Tailwind·글꼴) */
function copyStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n')
      const style = target.createElement('style')
      style.textContent = css
      target.head.appendChild(style)
    } catch {
      // 다른 출처 스타일시트(웹 글꼴 등)는 링크로 다시 불러온다
      if (sheet.href) {
        const link = target.createElement('link')
        link.rel = 'stylesheet'
        link.href = sheet.href
        target.head.appendChild(link)
      }
    }
  }
}

/** 클릭 등 사용자 동작 안에서 호출해야 한다 (브라우저 정책) */
export async function openMiniMailbox() {
  if (mode === 'pip' && pipWin) {
    pipWin.focus()
    return
  }
  const dp = docPip()
  if (dp) {
    try {
      const w = await dp.requestWindow({ width: WIDTH, height: HEIGHT })
      copyStyles(w.document)
      w.document.title = '쪽지 · My Archive'
      w.document.documentElement.dataset.theme = document.documentElement.dataset.theme ?? 'ivory'
      w.document.documentElement.lang = 'ko'
      w.addEventListener('pagehide', () => {
        if (pipWin === w) {
          pipWin = null
          setMode('closed')
        }
      })
      pipWin = w
      setMode('pip')
      return
    } catch {
      /* 거부되면 페이지 안 패널로 */
    }
  }
  setMode('inline')
}

export function closeMiniMailbox() {
  const w = pipWin
  pipWin = null
  setMode('closed')
  w?.close()
}

export function toggleMiniMailbox() {
  if (mode === 'closed') void openMiniMailbox()
  else closeMiniMailbox()
}

export function useMiniMailboxOpen(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    () => mode !== 'closed',
  )
}

/** AppLayout에 한 번 두는 렌더러 */
export function MiniMailboxHost() {
  const current = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    () => mode,
  )
  const navigate = useNavigate()
  const { theme } = useSettings()

  const openInApp = (id?: string) => {
    window.focus()
    navigate(id ? `/messages?id=${id}` : '/messages')
  }

  // 항상 위 창 안에 별도 React 루트로 그린다 (다른 문서라 포털 대신 루트 사용)
  useEffect(() => {
    if (current !== 'pip' || !pipWin) return
    const w = pipWin
    const host = w.document.createElement('div')
    host.style.height = '100%'
    w.document.body.style.margin = '0'
    w.document.body.appendChild(host)
    const root = createRoot(host)
    root.render(<MiniMailbox onClose={closeMiniMailbox} onOpenInApp={openInApp} />)
    return () => {
      // 미니 창 안의 버튼(닫기)으로 닫힐 때는 그 루트가 아직 처리 중이므로 다음 틱에 정리
      setTimeout(() => {
        root.unmount()
        host.remove()
      }, 0)
    }
    // navigate는 안정적이므로 다시 만들 필요 없음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  // 테마를 바꾸면 미니 창도 따라감
  useEffect(() => {
    if (pipWin) pipWin.document.documentElement.dataset.theme = theme
  }, [theme, current])

  // 본 창을 닫거나 로그아웃하면 미니 창도 닫기
  useEffect(() => () => closeMiniMailbox(), [])

  if (current !== 'inline') return null
  return (
    <div
      className="fixed right-5 bottom-5 z-50 hidden overflow-hidden rounded-[var(--radius-card)] border border-line shadow-[0_18px_48px_rgb(47_43_40/0.18)] md:block"
      style={{ width: WIDTH, height: HEIGHT }}
      role="dialog"
      aria-label="미니 쪽지창"
    >
      <MiniMailbox onClose={closeMiniMailbox} onOpenInApp={openInApp} />
    </div>
  )
}
