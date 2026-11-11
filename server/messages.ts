/**
 * 쪽지: 한 장씩 주고받는 편지 형식 (대화방 X).
 * 보낸 사람/받는 사람이 각자 지울 수 있고, 둘 다 지우면 실제로 삭제한다.
 */
import { randomUUID } from 'node:crypto'
import { db } from './db.ts'
import { HttpError, type User } from './auth.ts'

export const MAX_SUBJECT = 80
export const MAX_BODY = 2000

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

interface Row {
  id: string
  from_id: string
  to_id: string
  from_name: string
  to_name: string
  subject: string
  body: string
  created_at: number
  read_at: number | null
}

const SELECT = `SELECT m.id, m.from_id, m.to_id, uf.username AS from_name, ut.username AS to_name, m.subject, m.body, m.created_at, m.read_at
  FROM messages m JOIN users uf ON uf.id = m.from_id JOIN users ut ON ut.id = m.to_id`

const toItem = (r: Row): MessageItem => ({
  id: r.id,
  fromId: r.from_id,
  fromName: r.from_name,
  toId: r.to_id,
  toName: r.to_name,
  subject: r.subject,
  body: r.body,
  createdAt: Number(r.created_at),
  readAt: r.read_at === null ? null : Number(r.read_at),
})

async function areFriends(a: string, b: string) {
  const r = await db.get(
    "SELECT 1 FROM friend_requests WHERE status = 'accepted' AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))",
    [a, b, b, a],
  )
  return !!r
}

export async function listMessages(userId: string, box: 'inbox' | 'sent'): Promise<MessageItem[]> {
  const rows =
    box === 'inbox'
      ? await db.all<Row>(`${SELECT} WHERE m.to_id = ? AND m.recipient_deleted = 0 ORDER BY m.created_at DESC LIMIT 300`, [userId])
      : await db.all<Row>(`${SELECT} WHERE m.from_id = ? AND m.sender_deleted = 0 ORDER BY m.created_at DESC LIMIT 300`, [userId])
  return rows.map(toItem)
}

export async function unreadCount(userId: string): Promise<number> {
  const r = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM messages WHERE to_id = ? AND recipient_deleted = 0 AND read_at IS NULL', [userId])
  return Number(r?.n ?? 0)
}

/** 친구에게만 보낼 수 있다 */
export async function sendMessage(me: User, toId: string, subject: string, body: string): Promise<MessageItem> {
  const s = subject.trim().slice(0, MAX_SUBJECT)
  const b = body.trim()
  if (!b) throw new HttpError(400, '쪽지 내용을 적어 주세요.')
  if (b.length > MAX_BODY) throw new HttpError(400, `쪽지는 ${MAX_BODY}자까지 쓸 수 있어요.`)
  if (toId === me.id) throw new HttpError(400, '나에게는 쪽지를 보낼 수 없어요.')
  const target = await db.get<{ id: string }>('SELECT id FROM users WHERE id = ?', [toId])
  if (!target) throw new HttpError(404, '받는 사람을 찾을 수 없어요.')
  if (!(await areFriends(me.id, toId))) throw new HttpError(403, '친구에게만 쪽지를 보낼 수 있어요.')
  const id = randomUUID()
  await db.run(
    'INSERT INTO messages (id, from_id, to_id, subject, body, created_at, read_at, sender_deleted, recipient_deleted) VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 0)',
    [id, me.id, toId, s, b, Date.now()],
  )
  return toItem((await db.get<Row>(`${SELECT} WHERE m.id = ?`, [id]))!)
}

/** 쪽지 열기. 받는 사람이 처음 열면 읽음 처리 */
export async function openMessage(userId: string, id: string): Promise<{ item: MessageItem; justRead: boolean }> {
  const r = await db.get<Row & { sender_deleted: number; recipient_deleted: number }>(
    `${SELECT.replace('m.read_at', 'm.read_at, m.sender_deleted, m.recipient_deleted')} WHERE m.id = ?`,
    [id],
  )
  const visible = r && ((r.from_id === userId && !Number(r.sender_deleted)) || (r.to_id === userId && !Number(r.recipient_deleted)))
  if (!r || !visible) throw new HttpError(404, '쪽지를 찾을 수 없어요.')
  let justRead = false
  if (r.to_id === userId && r.read_at === null) {
    const now = Date.now()
    await db.run('UPDATE messages SET read_at = ? WHERE id = ? AND read_at IS NULL', [now, id])
    r.read_at = now
    justRead = true
  }
  return { item: toItem(r), justRead }
}

/** 내 쪽지함에서 지우기 (상대방 쪽지함에는 남음) */
export async function deleteMessage(userId: string, id: string) {
  const r = await db.get<{ from_id: string; to_id: string }>('SELECT from_id, to_id FROM messages WHERE id = ?', [id])
  if (!r) return
  if (r.from_id === userId) await db.run('UPDATE messages SET sender_deleted = 1 WHERE id = ?', [id])
  if (r.to_id === userId) await db.run('UPDATE messages SET recipient_deleted = 1 WHERE id = ?', [id])
  await db.run('DELETE FROM messages WHERE id = ? AND sender_deleted = 1 AND recipient_deleted = 1', [id])
}
