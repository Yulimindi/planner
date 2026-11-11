/**
 * 공유 페이지 대화: 카테고리(페이지)마다 하나의 대화방.
 * 소유자와 공유받은 사람(보기 전용 포함)이 읽고 쓸 수 있다.
 */
import { randomUUID } from 'node:crypto'
import { db } from './db.ts'
import { HttpError, type User } from './auth.ts'
import { roleFor } from './docs.ts'

export const MAX_CHAT = 1000
const PAGE = 100

export interface ChatItem {
  id: string
  categoryId: string
  userId: string
  name: string
  body: string
  createdAt: number
}

interface Row {
  id: string
  category_id: string
  user_id: string
  username: string
  body: string
  created_at: number
}

const SELECT = `SELECT c.id, c.category_id, c.user_id, u.username, c.body, c.created_at
  FROM category_chats c JOIN users u ON u.id = c.user_id`

const toItem = (r: Row): ChatItem => ({
  id: r.id,
  categoryId: r.category_id,
  userId: r.user_id,
  name: r.username,
  body: r.body,
  createdAt: Number(r.created_at),
})

async function assertMember(userId: string, categoryId: string) {
  if (!(await roleFor(userId, categoryId))) throw new HttpError(404, '페이지를 찾을 수 없어요.')
}

/** 최근 대화 (오래된 것 → 최신 순). before를 주면 그 이전 것 */
export async function listChats(userId: string, categoryId: string, before?: number): Promise<{ items: ChatItem[]; hasMore: boolean }> {
  await assertMember(userId, categoryId)
  const rows = before
    ? await db.all<Row>(`${SELECT} WHERE c.category_id = ? AND c.created_at < ? ORDER BY c.created_at DESC LIMIT ?`, [categoryId, before, PAGE + 1])
    : await db.all<Row>(`${SELECT} WHERE c.category_id = ? ORDER BY c.created_at DESC LIMIT ?`, [categoryId, PAGE + 1])
  const hasMore = rows.length > PAGE
  return { items: rows.slice(0, PAGE).reverse().map(toItem), hasMore }
}

export async function postChat(me: User, categoryId: string, body: string): Promise<ChatItem> {
  await assertMember(me.id, categoryId)
  const b = body.trim()
  if (!b) throw new HttpError(400, '내용을 입력해 주세요.')
  if (b.length > MAX_CHAT) throw new HttpError(400, `한 번에 ${MAX_CHAT}자까지 보낼 수 있어요.`)
  const id = randomUUID()
  await db.run('INSERT INTO category_chats (id, category_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)', [
    id, categoryId, me.id, b, Date.now(),
  ])
  return toItem((await db.get<Row>(`${SELECT} WHERE c.id = ?`, [id]))!)
}

/** 내가 쓴 말만 지울 수 있다. 지운 메시지의 카테고리 id 반환 */
export async function deleteChat(userId: string, id: string): Promise<string | null> {
  const r = await db.get<{ category_id: string; user_id: string }>('SELECT category_id, user_id FROM category_chats WHERE id = ?', [id])
  if (!r) return null
  if (r.user_id !== userId) throw new HttpError(403, '내가 보낸 말만 지울 수 있어요.')
  await db.run('DELETE FROM category_chats WHERE id = ?', [id])
  return r.category_id
}
