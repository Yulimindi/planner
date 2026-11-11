/**
 * 친구: 아이디로 요청 → 상대가 수락하면 친구.
 * friend_requests(from_id, to_id, status) 한 줄이 두 사람의 관계를 나타낸다.
 *  - pending : from → to 요청 대기
 *  - accepted: 친구 (방향 무관)
 */
import { db, tx } from './db.ts'
import { HttpError, findUserByName, type User } from './auth.ts'

export interface FriendEntry {
  userId: string
  username: string
  at: number
}

export interface FriendsPayload {
  friends: FriendEntry[]
  incoming: FriendEntry[]
  outgoing: FriendEntry[]
}

interface Rel {
  from_id: string
  to_id: string
  status: 'pending' | 'accepted'
}

const relBetween = (a: string, b: string) =>
  db.get<Rel>(
    'SELECT from_id, to_id, status FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)',
    [a, b, b, a],
  )

export async function listFriends(userId: string): Promise<FriendsPayload> {
  const rows = await db.all<{ from_id: string; to_id: string; status: string; at: number; from_name: string; to_name: string }>(
    `SELECT r.from_id, r.to_id, r.status, r.updated_at AS at, uf.username AS from_name, ut.username AS to_name
     FROM friend_requests r
     JOIN users uf ON uf.id = r.from_id
     JOIN users ut ON ut.id = r.to_id
     WHERE r.from_id = ? OR r.to_id = ?
     ORDER BY r.updated_at DESC`,
    [userId, userId],
  )
  const out: FriendsPayload = { friends: [], incoming: [], outgoing: [] }
  for (const r of rows) {
    const mine = r.from_id === userId
    const other: FriendEntry = { userId: mine ? r.to_id : r.from_id, username: mine ? r.to_name : r.from_name, at: Number(r.at) }
    if (r.status === 'accepted') out.friends.push(other)
    else if (mine) out.outgoing.push(other)
    else out.incoming.push(other)
  }
  out.friends.sort((a, b) => a.username.localeCompare(b.username, 'ko'))
  return out
}

/** 친구 요청. 상대가 이미 나에게 요청했다면 바로 친구가 된다. */
export async function requestFriend(me: User, username: string): Promise<{ target: User; accepted: boolean }> {
  const target = await findUserByName(username.trim())
  if (!target) throw new HttpError(404, `"${username.trim()}" 사용자를 찾을 수 없어요.`)
  if (target.id === me.id) throw new HttpError(400, '본인에게는 친구 요청을 보낼 수 없어요.')
  return tx(async (q) => {
    const rel = await q.get<Rel>(
      'SELECT from_id, to_id, status FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)',
      [me.id, target.id, target.id, me.id],
    )
    const now = Date.now()
    if (rel?.status === 'accepted') throw new HttpError(409, `이미 ${target.username}님과 친구예요.`)
    if (rel && rel.from_id === me.id) throw new HttpError(409, '이미 친구 요청을 보냈어요. 상대방의 수락을 기다려 주세요.')
    if (rel && rel.from_id === target.id) {
      await q.run("UPDATE friend_requests SET status = 'accepted', updated_at = ? WHERE from_id = ? AND to_id = ?", [now, target.id, me.id])
      return { target, accepted: true }
    }
    await q.run("INSERT INTO friend_requests (from_id, to_id, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)", [
      me.id, target.id, now, now,
    ])
    return { target, accepted: false }
  })
}

export async function acceptFriend(meId: string, fromId: string) {
  const rel = await relBetween(meId, fromId)
  if (!rel || rel.status !== 'pending' || rel.to_id !== meId) throw new HttpError(404, '받은 친구 요청을 찾을 수 없어요.')
  await db.run("UPDATE friend_requests SET status = 'accepted', updated_at = ? WHERE from_id = ? AND to_id = ?", [Date.now(), fromId, meId])
}

/** 요청 거절 · 보낸 요청 취소 · 친구 삭제 모두 관계를 지운다 */
export async function removeRelation(meId: string, otherId: string): Promise<boolean> {
  const rel = await relBetween(meId, otherId)
  if (!rel) return false
  await db.run('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', [meId, otherId, otherId, meId])
  return true
}
