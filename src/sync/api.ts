import { uid } from '../lib/utils'

/** 탭(연결)마다 고유한 id. 내가 보낸 변경이 나에게 되돌아오지 않게 한다. */
export const CLIENT_ID = uid()

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Listener = () => void
const unauthorizedListeners = new Set<Listener>()
export const onUnauthorized = (fn: Listener) => {
  unauthorizedListeners.add(fn)
  return () => {
    unauthorizedListeners.delete(fn)
  }
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; raw?: Blob; headers?: Record<string, string>; quiet401?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'X-Client-Id': CLIENT_ID, ...opts.headers }
  let body: BodyInit | undefined
  if (opts.raw) body = opts.raw
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  let res: Response
  try {
    res = await fetch(path, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body, credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, '서버에 연결할 수 없어요. 네트워크 상태를 확인해 주세요.')
  }
  if (res.status === 401 && !opts.quiet401) unauthorizedListeners.forEach((l) => l())
  if (!res.ok) {
    let message = `요청에 실패했어요. (${res.status})`
    try {
      const j = (await res.json()) as { error?: string }
      if (j.error) message = j.error
    } catch {
      /* 본문 없음 */
    }
    throw new ApiError(res.status, message)
  }
  const type = res.headers.get('content-type') ?? ''
  return (type.includes('application/json') ? await res.json() : await res.blob()) as T
}

export interface AuthUser {
  id: string
  username: string
}
