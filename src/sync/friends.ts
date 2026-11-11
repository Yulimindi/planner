/**
 * 친구 목록 스토어. 서버에서 받아 메모리에 두고,
 * WebSocket 'friends' 알림이 오면 다시 받아온다.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { api } from './api'
import { onPresence, onReconnect } from './engine'

export interface FriendEntry {
  userId: string
  username: string
  at: number
}

export interface FriendsData {
  friends: FriendEntry[]
  incoming: FriendEntry[]
  outgoing: FriendEntry[]
}

const EMPTY: FriendsData = { friends: [], incoming: [], outgoing: [] }
let data: FriendsData | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function set(next: FriendsData) {
  data = next
  emit()
}

export async function refreshFriends() {
  try {
    set(await api<FriendsData>('/api/friends'))
  } catch {
    /* 오프라인 등: 마지막 목록 유지 */
  }
}

export async function sendFriendRequest(username: string) {
  const r = await api<{ accepted: boolean; friends: FriendsData }>('/api/friends', { body: { username } })
  set(r.friends)
  return r.accepted
}

export async function acceptFriendRequest(userId: string) {
  set(await api<FriendsData>(`/api/friends/${userId}/accept`, { method: 'POST' }))
}

/** 거절 · 요청 취소 · 친구 삭제 */
export async function removeFriend(userId: string) {
  set(await api<FriendsData>(`/api/friends/${userId}`, { method: 'DELETE' }))
}

export function resetFriends() {
  data = null
  emit()
}

const store = {
  subscribe: (fn: () => void) => {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
  get: () => data,
}

export function useFriends(): FriendsData & { loaded: boolean } {
  const d = useSyncExternalStore(store.subscribe, store.get)
  return { ...(d ?? EMPTY), loaded: d !== null }
}

export interface FriendEvent {
  event?: 'request' | 'accepted'
  name?: string
}

/**
 * 로그인 상태에서 한 번 연결: 처음 목록을 받고, 실시간 알림·재연결 시 갱신.
 * onEvent로 '요청 받음/수락됨' 알림을 띄울 수 있다.
 */
export function useFriendsSync(onEvent?: (e: FriendEvent) => void) {
  useEffect(() => {
    void refreshFriends()
    const offMsg = onPresence((m) => {
      if (m.type !== 'friends') return
      void refreshFriends()
      if (m.event) onEvent?.({ event: m.event as FriendEvent['event'], name: String(m.name ?? '') })
    })
    const offRe = onReconnect(() => void refreshFriends())
    return () => {
      offMsg()
      offRe()
      resetFriends()
    }
    // onEvent는 렌더마다 바뀌어도 다시 구독할 필요 없음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
