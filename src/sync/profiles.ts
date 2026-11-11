/**
 * 사용자 프로필(닉네임·사진) 캐시.
 * 화면 곳곳에서 useProfile(id)로 요청하면 짧게 모아서 한 번에 서버에서 받아온다.
 * 누군가 프로필을 바꾸면 WebSocket 'profile' 알림으로 다시 받아온다.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { api } from './api'
import { onPresence, onReconnect } from './engine'

export interface Profile {
  id: string
  username: string
  displayName: string
  avatarVer: number | null
}

const cache = new Map<string, Profile>()
const pending = new Set<string>()
const inflight = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null
let version = 0
const listeners = new Set<() => void>()
const emit = () => {
  version++
  listeners.forEach((l) => l())
}

async function flush() {
  timer = null
  const ids = [...pending]
  pending.clear()
  if (!ids.length) return
  ids.forEach((id) => inflight.add(id))
  try {
    const { profiles } = await api<{ profiles: Profile[] }>('/api/profiles', { body: { ids } })
    for (const p of profiles) cache.set(p.id, p)
    emit()
  } catch {
    /* 오프라인: 다음 기회에 */
  } finally {
    ids.forEach((id) => inflight.delete(id))
  }
}

function request(id: string, force = false) {
  if (!id || (!force && (cache.has(id) || inflight.has(id)))) return
  pending.add(id)
  if (!timer) timer = setTimeout(() => void flush(), 30)
}

/** 훅 없이 캐시된 프로필 읽기 (문구 만들 때) */
export const peekProfile = (id: string | null | undefined) => (id ? cache.get(id) : undefined)

export function setProfile(p: Profile) {
  cache.set(p.id, p)
  emit()
}

export function invalidateProfile(id: string) {
  request(id, true)
}

export function clearProfiles() {
  cache.clear()
  emit()
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useProfile(id: string | null | undefined): Profile | undefined {
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => {
    if (id) request(id)
  }, [id])
  return id ? cache.get(id) : undefined
}

/** 프로필 사진 주소 (없으면 null). 미니 창(다른 문서)에서도 쓰도록 절대 주소로 만든다 */
export const avatarUrl = (p: Profile | undefined): string | null =>
  p?.avatarVer ? `${window.location.origin}/api/avatars/${p.id}?v=${p.avatarVer}` : null

/** 로그인 상태에서 한 번: 프로필 변경 알림 받기 */
export function useProfileSync() {
  useEffect(() => {
    const off = onPresence((m) => {
      if (m.type === 'profile' && typeof m.userId === 'string') invalidateProfile(m.userId)
    })
    // 다시 연결되면 그동안 바뀌었을 수 있으니 전부 새로
    const offRe = onReconnect(() => [...cache.keys()].forEach((id) => request(id, true)))
    return () => {
      off()
      offRe()
      clearProfiles()
    }
  }, [])
}

/* ── 프로필 수정 ─────────────────────────────────────────── */
export async function saveNickname(displayName: string) {
  const { profile } = await api<{ profile: Profile }>('/api/me', { method: 'PATCH', body: { displayName } })
  setProfile(profile)
  return profile
}

export async function uploadAvatar(blob: Blob) {
  const { profile } = await api<{ profile: Profile }>('/api/me/avatar', { method: 'PUT', raw: blob, headers: { 'Content-Type': blob.type || 'image/webp' } })
  setProfile(profile)
  return profile
}

export async function deleteAvatar() {
  const { profile } = await api<{ profile: Profile }>('/api/me/avatar', { method: 'DELETE' })
  setProfile(profile)
  return profile
}
