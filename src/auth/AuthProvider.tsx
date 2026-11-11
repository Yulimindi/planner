import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError, api, onUnauthorized, type AuthUser } from '../sync/api'
import { cachedUser, endSession, startSession } from '../sync/engine'

type Status =
  | { status: 'loading' }
  | { status: 'anon'; notice?: string }
  | { status: 'ready'; user: AuthUser; offline: boolean }
  | { status: 'error'; message: string }

interface AuthCtx {
  state: Status
  user: AuthUser | null
  login: (username: string, password: string) => Promise<void>
  signup: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  retry: () => void
}

const Ctx = createContext<AuthCtx | null>(null)

export function useAuth(): AuthCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('AuthProvider가 필요합니다.')
  return c
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Status>({ status: 'loading' })
  const booted = useRef(false)

  const begin = useCallback(async (user: AuthUser) => {
    setState({ status: 'loading' })
    try {
      await startSession(user)
      setState({ status: 'ready', user, offline: false })
    } catch (e) {
      const cached = cachedUser()
      if (e instanceof ApiError && e.status === 0 && cached?.id === user.id) {
        await startSession(user, { offline: true })
        setState({ status: 'ready', user, offline: true })
      } else {
        setState({ status: 'error', message: e instanceof Error ? e.message : '데이터를 불러오지 못했어요.' })
      }
    }
  }, [])

  const boot = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const { user } = await api<{ user: AuthUser }>('/api/me', { quiet401: true })
      await begin(user)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        // 세션 만료: 이 브라우저의 캐시는 다른 사람이 볼 수 없도록 비운다
        if (cachedUser()) await endSession()
        setState({ status: 'anon' })
      } else if (e instanceof ApiError && e.status === 0 && cachedUser()) {
        const user = cachedUser()!
        await startSession(user, { offline: true })
        setState({ status: 'ready', user, offline: true })
      } else {
        setState({ status: 'error', message: e instanceof Error ? e.message : '서버에 연결할 수 없어요.' })
      }
    }
  }, [begin])

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    void boot()
  }, [boot])

  useEffect(
    () =>
      onUnauthorized(() => {
        void endSession({ keepCache: true })
        setState({ status: 'anon', notice: '로그인이 만료되었어요. 다시 로그인해 주세요.' })
      }),
    [],
  )

  const login = async (username: string, password: string) => {
    const { user } = await api<{ user: AuthUser }>('/api/login', { body: { username, password }, quiet401: true })
    const prev = cachedUser()
    if (prev && prev.id !== user.id) await endSession()
    await begin(user)
  }

  const signup = async (username: string, password: string) => {
    const { user } = await api<{ user: AuthUser }>('/api/signup', { body: { username, password } })
    const prev = cachedUser()
    if (prev && prev.id !== user.id) await endSession()
    await begin(user)
  }

  const logout = async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => undefined)
    await endSession()
    setState({ status: 'anon' })
  }

  const user = state.status === 'ready' ? state.user : null
  return <Ctx.Provider value={{ state, user, login, signup, logout, retry: () => void boot() }}>{children}</Ctx.Provider>
}
