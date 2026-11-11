import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MousePointer2 } from 'lucide-react'
import { onPresence, onReconnect, sendRealtime } from '../../sync/engine'
import { CLIENT_ID } from '../../sync/api'
import { PASTELS } from '../../lib/colors'
import { cn } from '../../lib/utils'

export interface Peer {
  cid: string
  uid: string
  name: string
  x: number | null
  y: number | null
  seen: number
}

/** 사용자마다 고정된 커서 색 */
export function peerColor(uid: string) {
  let h = 0
  for (const ch of uid) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PASTELS[h % PASTELS.length]
}

export const PAGE_CONTAINER_ID = 'page-container'

/**
 * 공유 페이지의 실시간 접속자·마우스 위치.
 * 좌표는 본문 컨테이너(#page-container)의 왼쪽 위를 기준으로 한 px 값이라
 * 창 크기가 달라도 같은 내용 위에 커서가 표시된다.
 */
export function usePresence(categoryId: string | undefined, enabled: boolean, room: string) {
  const [peers, setPeers] = useState<Map<string, Peer>>(new Map())
  const last = useRef(0)

  useEffect(() => {
    if (!enabled || !categoryId) return
    const join = () => sendRealtime({ type: 'join', categoryId, room })
    join()
    setPeers(new Map())

    const offMsg = onPresence((m) => {
      setPeers((prev) => {
        const next = new Map(prev)
        const now = Date.now()
        switch (m.type) {
          case 'peers':
            next.clear()
            for (const p of m.peers as { cid: string; uid: string; name: string }[]) {
              if (p.cid !== CLIENT_ID) next.set(p.cid, { ...p, x: null, y: null, seen: now })
            }
            return next
          case 'joined':
            next.set(String(m.cid), { cid: String(m.cid), uid: String(m.uid), name: String(m.name), x: null, y: null, seen: now })
            return next
          case 'cursor': {
            const cid = String(m.cid)
            next.set(cid, {
              cid, uid: String(m.uid), name: String(m.name),
              x: typeof m.x === 'number' ? m.x : null, y: typeof m.y === 'number' ? m.y : null, seen: now,
            })
            return next
          }
          case 'gone':
            next.delete(String(m.cid))
            return next
          case 'kicked':
            return new Map()
          default:
            return prev
        }
      })
    })
    const offRe = onReconnect(join)

    const container = () => document.getElementById(PAGE_CONTAINER_ID)
    const onMove = (e: PointerEvent) => {
      const now = performance.now()
      if (now - last.current < 40) return
      last.current = now
      const el = container()
      if (!el) return
      const r = el.getBoundingClientRect()
      sendRealtime({ type: 'cursor', x: Math.round(e.clientX - r.left), y: Math.round(e.clientY - r.top) })
    }
    const onLeave = () => sendRealtime({ type: 'cursor', x: null, y: null })
    window.addEventListener('pointermove', onMove)
    document.documentElement.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onLeave)

    return () => {
      sendRealtime({ type: 'leave' })
      offMsg()
      offRe()
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
      setPeers(new Map())
    }
  }, [categoryId, enabled, room])

  return [...peers.values()]
}

/** 다른 사람의 마우스 커서를 본문 컨테이너 위에 그린다 */
export function CursorLayer({ peers }: { peers: Peer[] }) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  useEffect(() => setEl(document.getElementById(PAGE_CONTAINER_ID)), [])
  if (!el) return null
  return createPortal(
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden>
      {peers
        .filter((p) => p.x !== null && p.y !== null)
        .map((p) => {
          const c = peerColor(p.uid)
          return (
            <div
              key={p.cid}
              className="absolute top-0 left-0 transition-transform duration-75 ease-linear"
              style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
            >
              <MousePointer2 size={20} strokeWidth={1.5} style={{ color: c.fg, fill: c.bg }} className="drop-shadow-sm" />
              <span
                className="ml-3 -mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap shadow-sm"
                style={{ background: c.fg, color: '#fff' }}
              >
                {p.name}
              </span>
            </div>
          )
        })}
    </div>,
    el,
  )
}

/** 지금 이 페이지를 함께 보고 있는 사람들 */
export function PeerAvatars({ peers, className }: { peers: Peer[]; className?: string }) {
  const unique = [...new Map(peers.map((p) => [p.uid, p])).values()]
  if (!unique.length) return null
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex -space-x-2">
        {unique.slice(0, 5).map((p) => {
          const c = peerColor(p.uid)
          return (
            <span
              key={p.uid}
              title={`${p.name}님이 보고 있어요`}
              className="flex size-7 items-center justify-center rounded-full border-2 border-card text-[11px] font-semibold"
              style={{ background: c.bg, color: c.fg }}
            >
              {p.name.slice(0, 1).toUpperCase()}
            </span>
          )
        })}
      </div>
      <span className="text-[12px] text-muted">{unique.length}명이 함께 보는 중</span>
    </div>
  )
}
