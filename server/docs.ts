import { db, tx, type Q } from './db.ts'
import { HttpError } from './auth.ts'

export const TABLES = ['categories', 'memos', 'columns', 'rows', 'checklist'] as const
export type Tbl = (typeof TABLES)[number]
export type Role = 'owner' | 'edit' | 'view'

type Json = Record<string, unknown>

export type Op =
  | { t: Tbl | 'settings'; op: 'put'; id: string; data: Json }
  | { t: Tbl | 'settings'; op: 'patch'; id: string; mods: Json }
  | { t: Tbl | 'settings'; op: 'del'; id: string }

interface DocRow {
  tbl: string
  id: string
  owner: string
  category_id: string | null
  data: string
}

/* ── 권한 ───────────────────────────────────────────────── */
export async function categoryOwner(categoryId: string, q: Q = db): Promise<string | null> {
  const r = await q.get<{ owner: string }>("SELECT owner FROM docs WHERE tbl = 'categories' AND id = ?", [categoryId])
  return r?.owner ?? null
}

export async function roleFor(userId: string, categoryId: string, q: Q = db): Promise<Role | null> {
  const owner = await categoryOwner(categoryId, q)
  if (!owner) return null
  if (owner === userId) return 'owner'
  const s = await q.get<{ role: Role }>('SELECT role FROM shares WHERE category_id = ? AND user_id = ?', [categoryId, userId])
  return s?.role ?? null
}

const canWrite = (role: Role | null) => role === 'owner' || role === 'edit'

/** 이 카테고리 문서를 받아야 하는 사용자 id 목록 */
export async function audienceOf(categoryId: string | null, owner: string, q: Q = db): Promise<string[]> {
  if (!categoryId) return [owner]
  const catOwner = (await categoryOwner(categoryId, q)) ?? owner
  const shared = await q.all<{ user_id: string }>('SELECT user_id FROM shares WHERE category_id = ?', [categoryId])
  return [catOwner, ...shared.map((s) => s.user_id)]
}

/** keypath('a.b')를 지원하는 병합 (Dexie update의 mods 형식) */
function applyMods(target: Json, mods: Json): Json {
  const out: Json = structuredClone(target)
  for (const [path, value] of Object.entries(mods)) {
    const keys = path.split('.')
    let cur: Json = out
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]
      if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {}
      cur = cur[k] as Json
    }
    const last = keys[keys.length - 1]
    if (value === undefined) delete cur[last]
    else cur[last] = value
  }
  return out
}

const getDoc = (q: Q, t: Tbl, id: string) =>
  q.get<DocRow>('SELECT tbl, id, owner, category_id, data FROM docs WHERE tbl = ? AND id = ?', [t, id])

const writeDoc = (q: Q, t: Tbl, id: string, owner: string, categoryId: string | null, data: Json) =>
  q.run(
    `INSERT INTO docs (tbl, id, owner, category_id, data, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(tbl, id) DO UPDATE SET owner = excluded.owner, category_id = excluded.category_id, data = excluded.data, updated_at = excluded.updated_at`,
    [t, id, owner, categoryId, JSON.stringify(data), Date.now()],
  )

const catIdOf = (t: Tbl, id: string, data: Json): string | null =>
  t === 'categories' ? id : typeof data.categoryId === 'string' ? data.categoryId : null

export interface Applied {
  op: Op
  audience: string[]
}

/**
 * 클라이언트에서 받은 변경을 권한 확인 후 적용한다.
 * 적용된 변경과 각각의 수신 대상, 거부된 변경 id를 돌려준다.
 */
export function applyOps(userId: string, ops: Op[]): Promise<{ applied: Applied[]; rejected: string[] }> {
  return tx(async (q) => {
    const applied: Applied[] = []
    const rejected: string[] = []
    // 한 묶음 안에서 같은 카테고리 권한을 반복 조회하지 않도록 캐시
    const roleCache = new Map<string, Role | null>()
    const role = async (catId: string) => {
      if (!roleCache.has(catId)) roleCache.set(catId, await roleFor(userId, catId, q))
      return roleCache.get(catId)!
    }

    for (const op of ops) {
      if (!op || typeof op.id !== 'string' || typeof op.t !== 'string') continue

      if (op.t === 'settings') {
        if (op.op === 'del') await q.run('DELETE FROM settings WHERE user_id = ?', [userId])
        else {
          const cur = await q.get<{ data: string }>('SELECT data FROM settings WHERE user_id = ?', [userId])
          const base = cur ? (JSON.parse(cur.data) as Json) : {}
          const next = op.op === 'put' ? op.data : applyMods(base, op.mods)
          await q.run('INSERT INTO settings (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data', [
            userId, JSON.stringify(next),
          ])
        }
        applied.push({ op, audience: [userId] })
        continue
      }

      if (!(TABLES as readonly string[]).includes(op.t)) continue
      const t = op.t as Tbl
      const existing = await getDoc(q, t, op.id)
      const existingData = existing ? (JSON.parse(existing.data) as Json) : null

      // 기존 문서에 대한 권한
      if (existing) {
        const ok =
          t === 'categories'
            ? existing.owner === userId
            : existing.category_id
              ? canWrite(await role(existing.category_id))
              : existing.owner === userId
        if (!ok) {
          rejected.push(op.id)
          continue
        }
      }

      if (op.op === 'del') {
        if (!existing) continue
        const audience = await audienceOf(existing.category_id, existing.owner, q)
        await q.run('DELETE FROM docs WHERE tbl = ? AND id = ?', [t, op.id])
        if (t === 'categories') {
          await q.run('DELETE FROM shares WHERE category_id = ?', [op.id])
          roleCache.delete(op.id)
        }
        applied.push({ op, audience })
        continue
      }

      let data: Json
      if (op.op === 'put') data = { ...op.data, id: op.id }
      else if (existingData) data = applyMods(existingData, op.mods)
      else continue // 없는 문서의 부분 수정은 무시

      const newCat = catIdOf(t, op.id, data)
      let owner: string
      if (t === 'categories') {
        owner = existing?.owner ?? userId
        if (!existing) roleCache.set(op.id, 'owner')
      } else if (newCat) {
        // 새 카테고리에도 쓰기 권한이 있어야 함 (이동 포함)
        if (!canWrite(await role(newCat))) {
          rejected.push(op.id)
          continue
        }
        owner = (await categoryOwner(newCat, q))!
      } else {
        // 미분류(빠른 메모): 작성자 본인만
        if (existing && existing.owner !== userId) {
          rejected.push(op.id)
          continue
        }
        owner = userId
      }

      const audience = new Set(await audienceOf(newCat, owner, q))
      if (existing && existing.category_id !== newCat) {
        for (const u of await audienceOf(existing.category_id, existing.owner, q)) audience.add(u)
      }
      await writeDoc(q, t, op.id, owner, newCat, data)
      applied.push({ op, audience: [...audience] })
    }
    return { applied, rejected }
  })
}

/* ── 전체 동기화 ─────────────────────────────────────────── */
export interface AccessInfo {
  categoryId: string
  role: Role
  ownerId: string
  ownerName: string
  members: { userId: string; username: string; role: 'edit' | 'view' }[]
}

export async function syncPayload(userId: string) {
  const own = await db.all<{ id: string }>("SELECT id FROM docs WHERE tbl = 'categories' AND owner = ?", [userId])
  const shared = await db.all<{ id: string }>('SELECT category_id AS id FROM shares WHERE user_id = ?', [userId])
  const catIds = [...new Set([...own, ...shared].map((r) => r.id))]

  const docs: Record<Tbl, Json[]> = { categories: [], memos: [], columns: [], rows: [], checklist: [] }
  const push = (rows: DocRow[]) => {
    for (const r of rows) docs[r.tbl as Tbl]?.push(JSON.parse(r.data) as Json)
  }
  // 내 카테고리 + 공유받은 카테고리의 문서, 그리고 내 미분류 메모를 한 번에 조회
  push(
    await db.all<DocRow>(
      `SELECT tbl, id, owner, category_id, data FROM docs
       WHERE category_id IN (SELECT id FROM docs WHERE tbl = 'categories' AND owner = ?1)
          OR category_id IN (SELECT category_id FROM shares WHERE user_id = ?1)
          OR (category_id IS NULL AND owner = ?1)`,
      [userId],
    ),
  )

  const access = (await Promise.all(catIds.map((id) => accessInfo(userId, id)))).filter((a): a is AccessInfo => !!a)
  const s = await db.get<{ data: string }>('SELECT data FROM settings WHERE user_id = ?', [userId])
  return { docs, access, settings: s ? (JSON.parse(s.data) as Json) : null }
}

export async function accessInfo(userId: string, categoryId: string): Promise<AccessInfo | null> {
  const role = await roleFor(userId, categoryId)
  if (!role) return null
  const ownerId = (await categoryOwner(categoryId))!
  const owner = await db.get<{ username: string }>('SELECT username FROM users WHERE id = ?', [ownerId])
  const members = await db.all<AccessInfo['members'][number]>(
    'SELECT s.user_id AS userId, u.username, s.role FROM shares s JOIN users u ON u.id = s.user_id WHERE s.category_id = ? ORDER BY s.created_at',
    [categoryId],
  )
  return { categoryId, role, ownerId, ownerName: owner?.username ?? '알 수 없음', members }
}

/** 계정의 모든 소유 데이터 삭제 (백업 덮어쓰기·전체 초기화용). 영향받은 사용자 id 반환 */
export function resetOwnData(userId: string): Promise<string[]> {
  return tx(async (q) => {
    const cats = await q.all<{ id: string }>("SELECT id FROM docs WHERE tbl = 'categories' AND owner = ?", [userId])
    const affected = new Set<string>()
    for (const c of cats) {
      for (const u of await audienceOf(c.id, userId, q)) affected.add(u)
      await q.run('DELETE FROM shares WHERE category_id = ?', [c.id])
    }
    await q.run('DELETE FROM docs WHERE owner = ?', [userId])
    await q.run('DELETE FROM settings WHERE user_id = ?', [userId])
    await q.run('DELETE FROM images WHERE owner = ?', [userId])
    return [...affected]
  })
}

export async function assertOwner(userId: string, categoryId: string) {
  const role = await roleFor(userId, categoryId)
  if (!role) throw new HttpError(404, '카테고리를 찾을 수 없어요.')
  if (role !== 'owner') throw new HttpError(403, '카테고리 소유자만 공유를 관리할 수 있어요.')
}
