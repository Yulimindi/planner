import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { IncomingMessage } from 'node:http'
import type { NextFunction, Request, Response } from 'express'
import { db } from './db.ts'

export interface User {
  id: string
  username: string
}

export const COOKIE = 'ma_session'
const MAX_AGE_DAYS = 30
const MAX_AGE_MS = MAX_AGE_DAYS * 86400_000

const USERNAME_RE = /^[a-zA-Z0-9_가-힣]{3,20}$/
const scryptAsync = promisify(scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>

export function validateCredentials(username: unknown, password: unknown): string | null {
  if (typeof username !== 'string' || !USERNAME_RE.test(username.trim())) {
    return '아이디는 3~20자의 한글, 영문, 숫자, 밑줄(_)만 사용할 수 있어요.'
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 100) {
    return '비밀번호는 6자 이상이어야 해요.'
  }
  return null
}

const hash = async (password: string, salt: string) => (await scryptAsync(password, salt, 64)).toString('hex')

export async function createUser(username: string, password: string): Promise<User> {
  const exists = await db.get('SELECT 1 FROM users WHERE username = ?', [username])
  if (exists) throw new HttpError(409, '이미 사용 중인 아이디예요.')
  const id = randomUUID()
  const salt = randomBytes(16).toString('hex')
  try {
    await db.run('INSERT INTO users (id, username, pass, salt, created_at) VALUES (?, ?, ?, ?, ?)', [
      id, username, await hash(password, salt), salt, Date.now(),
    ])
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new HttpError(409, '이미 사용 중인 아이디예요.')
    throw e
  }
  return { id, username }
}

export async function verifyUser(username: string, password: string): Promise<User | null> {
  const row = await db.get<{ id: string; username: string; pass: string; salt: string }>(
    'SELECT id, username, pass, salt FROM users WHERE username = ?', [username],
  )
  if (!row) {
    await hash(password, 'dummy-salt-to-equalize-timing')
    return null
  }
  const a = Buffer.from(row.pass, 'hex')
  const b = Buffer.from(await hash(password, row.salt), 'hex')
  return a.length === b.length && timingSafeEqual(a, b) ? { id: row.id, username: row.username } : null
}

/* ── 세션 (DB 왕복을 줄이기 위해 짧게 메모리 캐시) ───────── */
const cache = new Map<string, { user: User; created: number; at: number }>()
const CACHE_MS = 60_000

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await db.run('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', [token, userId, Date.now()])
  return token
}

export async function deleteSession(token: string) {
  cache.delete(token)
  await db.run('DELETE FROM sessions WHERE token = ?', [token])
}

export function sessionCookie(token: string, secure: boolean) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_DAYS * 86400}${secure ? '; Secure' : ''}`
}
export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`

export function readToken(req: IncomingMessage): string | null {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE) return v.join('=') || null
  }
  return null
}

export async function userFromRequest(req: IncomingMessage): Promise<User | null> {
  const token = readToken(req)
  if (!token) return null
  const now = Date.now()
  const hit = cache.get(token)
  if (hit && now - hit.at < CACHE_MS && now - hit.created < MAX_AGE_MS) return hit.user
  const row = await db.get<{ id: string; username: string; created: number }>(
    'SELECT u.id, u.username, s.created_at AS created FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?',
    [token],
  )
  if (!row) {
    cache.delete(token)
    return null
  }
  if (now - Number(row.created) > MAX_AGE_MS) {
    await deleteSession(token)
    return null
  }
  const user = { id: row.id, username: row.username }
  cache.set(token, { user, created: Number(row.created), at: now })
  if (cache.size > 5000) cache.clear()
  return user
}

export async function findUserByName(username: string): Promise<User | null> {
  return (await db.get<User>('SELECT id, username FROM users WHERE username = ?', [username])) ?? null
}

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface AuthedRequest extends Request {
  user: User
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await userFromRequest(req)
    if (!user) {
      res.status(401).json({ error: '로그인이 필요해요.' })
      return
    }
    ;(req as AuthedRequest).user = user
    next()
  } catch (e) {
    next(e)
  }
}
