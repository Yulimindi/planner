/**
 * 쪽지: 안 읽은 개수 스토어 + 실시간 이벤트 전달.
 * 목록 자체는 Messages 페이지가 필요할 때 서버에서 받아온다.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { api } from './api'
import { onPresence, onReconnect } from './engine'

export interface MessageItem {
  id: string
  fromId: string
  fromName: string
  toId: string
  toName: string
  subject: string
  body: string
  createdAt: number
  readAt: number | null
}

export const MAX_SUBJECT = 80
export const MAX_BODY = 2000

let unread = 0
const unreadListeners = new Set<() => void>()
const setUnread = (n: number) => {
  if (unread === n) return
  unread = n
  unreadListeners.forEach((l) => l())
}

type MsgEvent = { event?: 'received' | 'read' | 'sent' | 'deleted'; name?: string; subject?: string; id?: string }
const eventListeners = new Set<(e: MsgEvent) => void>()
/** 쪽지함 화면이 실시간 변경을 받아 목록을 새로 고칠 때 사용 */
export const onMessagesEvent = (fn: (e: MsgEvent) => void) => {
  eventListeners.add(fn)
  return () => {
    eventListeners.delete(fn)
  }
}

export async function refreshUnread() {
  try {
    setUnread((await api<{ unread: number }>('/api/messages/unread')).unread)
  } catch {
    /* 오프라인: 유지 */
  }
}

export async function fetchBox(box: 'inbox' | 'sent') {
  const r = await api<{ items: MessageItem[]; unread: number }>(`/api/messages?box=${box}`)
  setUnread(r.unread)
  return r.items
}

export async function openMessage(id: string) {
  const r = await api<{ item: MessageItem; unread: number }>(`/api/messages/${id}`)
  setUnread(r.unread)
  return r.item
}

export async function sendMessage(to: string, subject: string, body: string) {
  return (await api<{ item: MessageItem }>('/api/messages', { body: { to, subject, body } })).item
}

export async function deleteMessage(id: string) {
  const r = await api<{ unread: number }>(`/api/messages/${id}`, { method: 'DELETE' })
  setUnread(r.unread)
}

export function useUnreadMessages(): number {
  return useSyncExternalStore(
    (fn) => {
      unreadListeners.add(fn)
      return () => {
        unreadListeners.delete(fn)
      }
    },
    () => unread,
  )
}

/** 로그인 상태에서 한 번: 안 읽은 개수 동기화 + 새 쪽지 알림 */
export function useMessagesSync(onReceived?: (e: MsgEvent) => void) {
  useEffect(() => {
    void refreshUnread()
    const off = onPresence((m) => {
      if (m.type !== 'messages') return
      const e = m as unknown as MsgEvent
      void refreshUnread()
      eventListeners.forEach((l) => l(e))
      if (e.event === 'received') onReceived?.(e)
    })
    const offRe = onReconnect(() => void refreshUnread())
    return () => {
      off()
      offRe()
      setUnread(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
