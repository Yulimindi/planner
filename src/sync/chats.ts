/** 공유 페이지 대화: 서버 API + 실시간 수신 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { onPresence, onReconnect } from './engine'

export interface ChatItem {
  id: string
  categoryId: string
  userId: string
  name: string
  body: string
  createdAt: number
}

export const MAX_CHAT = 1000

/**
 * 한 페이지의 대화 목록을 불러오고 실시간으로 갱신한다.
 * onIncoming: 다른 사람이 새로 보낸 말이 도착했을 때 (읽지 않음 표시용)
 */
export function useCategoryChat(categoryId: string, enabled: boolean, onIncoming?: (item: ChatItem) => void) {
  const [items, setItems] = useState<ChatItem[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const incomingRef = useRef(onIncoming)
  incomingRef.current = onIncoming

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: ChatItem[]; hasMore: boolean }>(`/api/chats/${categoryId}`)
      setItems(r.items)
      setHasMore(r.hasMore)
      setError('')
    } catch (e) {
      setItems((p) => p ?? [])
      setError(e instanceof Error ? e.message : '대화를 불러오지 못했어요.')
    }
  }, [categoryId])

  useEffect(() => {
    if (!enabled) return
    setItems(null)
    void load()
    const offMsg = onPresence((m) => {
      if (m.type !== 'chat' || m.categoryId !== categoryId) return
      if (m.event === 'new') {
        const item = m.item as ChatItem
        setItems((list) => (list && !list.some((x) => x.id === item.id) ? [...list, item] : list))
        incomingRef.current?.(item)
      } else if (m.event === 'deleted') {
        setItems((list) => list?.filter((x) => x.id !== m.id) ?? list)
      }
    })
    // 연결이 끊긴 동안 놓친 말을 다시 받는다
    const offRe = onReconnect(() => void load())
    return () => {
      offMsg()
      offRe()
    }
  }, [categoryId, enabled, load])

  const loadMore = async () => {
    const first = items?.[0]
    if (!first) return
    const r = await api<{ items: ChatItem[]; hasMore: boolean }>(`/api/chats/${categoryId}?before=${first.createdAt}`)
    setItems((list) => [...r.items, ...(list ?? [])])
    setHasMore(r.hasMore)
  }

  const send = async (body: string) => {
    const r = await api<{ item: ChatItem }>(`/api/chats/${categoryId}`, { body: { body } })
    setItems((list) => (list && !list.some((x) => x.id === r.item.id) ? [...list, r.item] : list))
  }

  const remove = async (id: string) => {
    await api(`/api/chats/message/${id}`, { method: 'DELETE' })
    setItems((list) => list?.filter((x) => x.id !== id) ?? list)
  }

  return { items, hasMore, error, loadMore, send, remove }
}
