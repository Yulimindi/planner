/**
 * DB 접근 계층 (libSQL)
 * - 배포: TURSO_DATABASE_URL + TURSO_AUTH_TOKEN 으로 Turso에 연결
 * - 로컬: 환경변수가 없으면 server/data/archive.db 파일 사용
 */
import { createClient, type InArgs, type Transaction } from '@libsql/client'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

function resolveUrl(): string {
  if (process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL
  const file = process.env.ARCHIVE_DB ?? join(here, 'data', 'archive.db')
  mkdirSync(dirname(file), { recursive: true })
  return pathToFileURL(file).href
}

export const DB_URL = resolveUrl()
export const isRemote = !DB_URL.startsWith('file:')

const client = createClient({ url: DB_URL, authToken: process.env.TURSO_AUTH_TOKEN })

type Row = Record<string, unknown>
type Exec = Pick<Transaction, 'execute'>

/** 쿼리 실행기. 트랜잭션 안/밖에서 같은 방식으로 쓴다 */
export interface Q {
  all<T = Row>(sql: string, args?: InArgs): Promise<T[]>
  get<T = Row>(sql: string, args?: InArgs): Promise<T | undefined>
  run(sql: string, args?: InArgs): Promise<void>
}

function makeQ(ex: Exec): Q {
  return {
    async all<T>(sql: string, args: InArgs = []) {
      const r = await ex.execute({ sql, args })
      return r.rows as unknown as T[]
    },
    async get<T>(sql: string, args: InArgs = []) {
      const r = await ex.execute({ sql, args })
      return r.rows[0] as unknown as T | undefined
    },
    async run(sql: string, args: InArgs = []) {
      await ex.execute({ sql, args })
    },
  }
}

export const db: Q = makeQ(client)

// 쓰기 트랜잭션은 한 번에 하나씩 (단일 서버 인스턴스 기준, SQLITE_BUSY 방지)
let chain: Promise<unknown> = Promise.resolve()

export function tx<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    const t = await client.transaction('write')
    try {
      const r = await fn(makeQ(t))
      await t.commit()
      return r
    } catch (e) {
      await t.rollback().catch(() => undefined)
      throw e
    } finally {
      t.close()
    }
  })
  chain = next.catch(() => undefined)
  return next
}

export async function initSchema() {
  if (!isRemote) await client.execute('PRAGMA journal_mode = WAL')
  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        pass TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL
      )`,
      // 카테고리·메모·열·행·체크리스트를 JSON 문서로 저장
      // owner: 문서가 속한 카테고리의 소유자 (미분류 메모는 작성자)
      // category_id: 권한 판단 기준 (categories 문서는 자기 id)
      `CREATE TABLE IF NOT EXISTS docs (
        tbl TEXT NOT NULL,
        id TEXT NOT NULL,
        owner TEXT NOT NULL,
        category_id TEXT,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tbl, id)
      )`,
      'CREATE INDEX IF NOT EXISTS docs_category ON docs(category_id)',
      'CREATE INDEX IF NOT EXISTS docs_owner ON docs(owner)',
      `CREATE TABLE IF NOT EXISTS settings (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        data TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS shares (
        category_id TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('edit', 'view')),
        created_at INTEGER NOT NULL,
        PRIMARY KEY (category_id, user_id)
      )`,
      `CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        data BLOB NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)',
      // 친구 요청/관계 (status: pending | accepted)
      `CREATE TABLE IF NOT EXISTS friend_requests (
        from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (from_id, to_id)
      )`,
      'CREATE INDEX IF NOT EXISTS friend_requests_to ON friend_requests(to_id)',
      // 쪽지 (보낸/받은 사람이 각자 삭제 가능)
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        read_at INTEGER,
        sender_deleted INTEGER NOT NULL DEFAULT 0,
        recipient_deleted INTEGER NOT NULL DEFAULT 0
      )`,
      'CREATE INDEX IF NOT EXISTS messages_to ON messages(to_id, created_at)',
      'CREATE INDEX IF NOT EXISTS messages_from ON messages(from_id, created_at)',
    ],
    'write',
  )
}

export function closeDb() {
  client.close()
}
