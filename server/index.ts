import express, { type NextFunction, type Request, type Response } from 'express'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeDb, db, initSchema, isRemote } from './db.ts'
import {
  HttpError, clearCookie, createSession, createUser, deleteSession, findUserByName, nameOf, readToken, requireAuth,
  sessionCookie, updateCachedUser, validateCredentials, verifyUser, type AuthedRequest,
} from './auth.ts'
import { getProfile, getProfiles, migrateProfile, readAvatar, removeAvatar, setAvatar, setNickname, validateNickname, MAX_AVATAR_BYTES } from './profile.ts'
import { accessInfo, applyOps, assertOwner, audienceOf, resetOwnData, roleFor, syncPayload, type Op } from './docs.ts'
import { attachRealtime, revalidateRooms, sendToAll, sendToUsers, updateClientUser } from './realtime.ts'
import { acceptFriend, listFriends, removeRelation, requestFriend } from './friends.ts'
import { deleteMessage, listMessages, openMessage, sendMessage, unreadCount } from './messages.ts'

const PORT = Number(process.env.PORT ?? 3001)
const here = dirname(fileURLToPath(import.meta.url))
const app = express()
app.disable('x-powered-by')
// Render 등 앞단 프록시가 HTTPS를 처리하므로 X-Forwarded-Proto를 신뢰해야 Secure 쿠키가 붙는다
app.set('trust proxy', process.env.TRUST_PROXY ?? (process.env.RENDER ? 1 : 'loopback'))

const json = express.json({ limit: '25mb' })
const userOf = (req: Request) => (req as AuthedRequest).user
const clientId = (req: Request) => String(req.headers['x-client-id'] ?? '')
const isSecure = (req: Request) => req.secure

app.get('/api/health', async (_req, res) => {
  await db.get('SELECT 1')
  res.json({ ok: true })
})

/* ── 인증 ───────────────────────────────────────────────── */
app.post('/api/signup', json, async (req, res) => {
  const { username, password } = req.body ?? {}
  const err = validateCredentials(username, password)
  if (err) throw new HttpError(400, err)
  const user = await createUser(username.trim(), password)
  res.setHeader('Set-Cookie', sessionCookie(await createSession(user.id), isSecure(req)))
  res.json({ user, isNew: true })
})

app.post('/api/login', json, async (req, res) => {
  const { username, password } = req.body ?? {}
  if (typeof username !== 'string' || typeof password !== 'string') throw new HttpError(400, '아이디와 비밀번호를 입력해 주세요.')
  const user = await verifyUser(username.trim(), password)
  if (!user) throw new HttpError(401, '아이디 또는 비밀번호가 올바르지 않아요.')
  res.setHeader('Set-Cookie', sessionCookie(await createSession(user.id), isSecure(req)))
  res.json({ user })
})

app.post('/api/logout', async (req, res) => {
  const token = readToken(req)
  if (token) await deleteSession(token)
  res.setHeader('Set-Cookie', clearCookie)
  res.json({ ok: true })
})

app.get('/api/me', requireAuth, async (req, res) => {
  const me = userOf(req)
  const p = await getProfile(me.id)
  res.json({ user: { id: me.id, username: me.username, displayName: p?.displayName ?? me.username, avatarVer: p?.avatarVer ?? null } })
})

/* ── 프로필 (닉네임 · 사진) ───────────────────────────────── */
async function profileChanged(id: string) {
  const p = await getProfile(id)
  if (!p) return null
  updateCachedUser(id, { displayName: p.displayName })
  updateClientUser(id, { displayName: p.displayName })
  // 화면에 이 사람을 보여주고 있을 수 있는 모든 접속자에게 새로 받도록 알림
  sendToAll({ type: 'profile', userId: id })
  return p
}

app.patch('/api/me', requireAuth, json, async (req, res) => {
  const me = userOf(req)
  await setNickname(me.id, validateNickname(req.body?.displayName))
  res.json({ profile: await profileChanged(me.id) })
})

app.put('/api/me/avatar', requireAuth, express.raw({ type: () => true, limit: MAX_AVATAR_BYTES + 1024 }), async (req, res) => {
  const me = userOf(req)
  await setAvatar(me.id, String(req.headers['content-type'] ?? ''), req.body as Buffer)
  res.json({ profile: await profileChanged(me.id) })
})

app.delete('/api/me/avatar', requireAuth, async (req, res) => {
  const me = userOf(req)
  await removeAvatar(me.id)
  res.json({ profile: await profileChanged(me.id) })
})

app.post('/api/profiles', requireAuth, json, async (req, res) => {
  const ids = req.body?.ids
  if (!Array.isArray(ids)) throw new HttpError(400, '잘못된 요청이에요.')
  res.json({ profiles: await getProfiles(ids as string[]) })
})

// 주소에 ?v=버전이 붙으므로 오래 캐시해도 바뀌면 새로 받는다
app.get('/api/avatars/:userId', requireAuth, async (req, res) => {
  const row = await readAvatar(String(req.params.userId))
  if (!row) throw new HttpError(404, '프로필 사진이 없어요.')
  res.setHeader('Content-Type', row.type)
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
  res.send(Buffer.from(row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : row.data))
})

/* ── 동기화 ─────────────────────────────────────────────── */
app.get('/api/sync', requireAuth, async (req, res) => {
  res.json(await syncPayload(userOf(req).id))
})

app.post('/api/ops', requireAuth, json, async (req, res) => {
  const ops = req.body?.ops
  if (!Array.isArray(ops) || ops.length > 5000) throw new HttpError(400, '잘못된 요청이에요.')
  const user = userOf(req)
  const { applied, rejected } = await applyOps(user.id, ops as Op[])

  // 사용자별로 변경을 묶어서 실시간 전송
  const perUser = new Map<string, Op[]>()
  for (const a of applied) {
    for (const u of a.audience) {
      const list = perUser.get(u) ?? []
      list.push(a.op)
      perUser.set(u, list)
    }
  }
  for (const [u, list] of perUser) sendToUsers([u], { type: 'ops', ops: list, by: user.username }, clientId(req))

  // 카테고리 삭제 시 공유받던 사람들의 권한 정보도 갱신
  if (applied.some((a) => a.op.t === 'categories' && a.op.op === 'del')) {
    await revalidateRooms()
    const others = new Set(applied.flatMap((a) => a.audience).filter((u) => u !== user.id))
    sendToUsers(others, { type: 'resync' })
  }
  res.json({ ok: true, rejected })
})

app.post('/api/reset', requireAuth, async (req, res) => {
  const user = userOf(req)
  const affected = await resetOwnData(user.id)
  await revalidateRooms()
  sendToUsers(affected, { type: 'resync' }, clientId(req))
  res.json({ ok: true })
})

/* ── 이미지 ─────────────────────────────────────────────── */
const ID_RE = /^[a-zA-Z0-9-]{8,64}$/

app.put('/api/images/:id', requireAuth, express.raw({ type: () => true, limit: '25mb' }), async (req, res) => {
  const id = String(req.params.id)
  if (!ID_RE.test(id)) throw new HttpError(400, '잘못된 이미지 id예요.')
  const type = String(req.headers['content-type'] ?? 'application/octet-stream')
  if (!type.startsWith('image/')) throw new HttpError(400, '이미지 파일만 올릴 수 있어요.')
  const body = req.body as Buffer
  if (!Buffer.isBuffer(body) || !body.length) throw new HttpError(400, '빈 파일이에요.')
  const name = decodeURIComponent(String(req.headers['x-file-name'] ?? 'image')).slice(0, 200)
  const existing = await db.get<{ owner: string }>('SELECT owner FROM images WHERE id = ?', [id])
  if (existing && existing.owner !== userOf(req).id) throw new HttpError(403, '권한이 없어요.')
  await db.run('INSERT OR REPLACE INTO images (id, owner, type, name, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
    id, userOf(req).id, type, name, new Uint8Array(body), Date.now(),
  ])
  res.json({ ok: true })
})

// 이미지 id는 추측할 수 없는 UUID이며, 로그인한 사용자만 받을 수 있음
app.get('/api/images/:id', requireAuth, async (req, res) => {
  const row = await db.get<{ type: string; name: string; data: ArrayBuffer | Uint8Array }>(
    'SELECT type, name, data FROM images WHERE id = ?', [String(req.params.id)],
  )
  if (!row) throw new HttpError(404, '이미지를 찾을 수 없어요.')
  res.setHeader('Content-Type', row.type)
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
  res.setHeader('X-File-Name', encodeURIComponent(row.name))
  res.send(Buffer.from(row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : row.data))
})

app.delete('/api/images/:id', requireAuth, async (req, res) => {
  await db.run('DELETE FROM images WHERE id = ? AND owner = ?', [String(req.params.id), userOf(req).id])
  res.json({ ok: true })
})

/* ── 친구 ───────────────────────────────────────────────── */
// 관계가 바뀌면 두 사람 모두에게 알려 목록을 다시 받게 한다
const notifyFriends = (ids: string[], extra: Record<string, unknown> = {}) => sendToUsers(ids, { type: 'friends', ...extra })

app.get('/api/friends', requireAuth, async (req, res) => {
  res.json(await listFriends(userOf(req).id))
})

app.post('/api/friends', requireAuth, json, async (req, res) => {
  const me = userOf(req)
  const username = req.body?.username
  if (typeof username !== 'string' || !username.trim()) throw new HttpError(400, '친구의 아이디를 입력해 주세요.')
  const { target, accepted } = await requestFriend(me, username)
  notifyFriends([me.id])
  notifyFriends([target.id], accepted ? { event: 'accepted', name: nameOf(me) } : { event: 'request', name: nameOf(me) })
  res.json({ accepted, friends: await listFriends(me.id) })
})

app.post('/api/friends/:userId/accept', requireAuth, async (req, res) => {
  const me = userOf(req)
  const other = String(req.params.userId)
  await acceptFriend(me.id, other)
  notifyFriends([me.id])
  notifyFriends([other], { event: 'accepted', name: nameOf(me) })
  res.json(await listFriends(me.id))
})

// 거절 · 요청 취소 · 친구 삭제
app.delete('/api/friends/:userId', requireAuth, async (req, res) => {
  const me = userOf(req)
  const other = String(req.params.userId)
  if (await removeRelation(me.id, other)) notifyFriends([me.id, other])
  res.json(await listFriends(me.id))
})

/* ── 쪽지 ───────────────────────────────────────────────── */
app.get('/api/messages', requireAuth, async (req, res) => {
  const me = userOf(req).id
  const box = req.query.box === 'sent' ? 'sent' : 'inbox'
  res.json({ items: await listMessages(me, box), unread: await unreadCount(me) })
})

app.get('/api/messages/unread', requireAuth, async (req, res) => {
  res.json({ unread: await unreadCount(userOf(req).id) })
})

app.get('/api/messages/:id', requireAuth, async (req, res) => {
  const me = userOf(req)
  const { item, justRead } = await openMessage(me.id, String(req.params.id))
  // 읽음 표시를 보낸 사람 화면과 내 다른 탭에도 반영
  if (justRead) sendToUsers([item.fromId, me.id], { type: 'messages', event: 'read', id: item.id }, clientId(req))
  res.json({ item, unread: await unreadCount(me.id) })
})

app.post('/api/messages', requireAuth, json, async (req, res) => {
  const me = userOf(req)
  const { to, subject, body } = req.body ?? {}
  if (typeof to !== 'string' || typeof body !== 'string') throw new HttpError(400, '받는 사람과 내용을 확인해 주세요.')
  const item = await sendMessage(me, to, typeof subject === 'string' ? subject : '', body)
  sendToUsers([item.toId], { type: 'messages', event: 'received', name: nameOf(me), subject: item.subject || item.body.slice(0, 30) })
  sendToUsers([me.id], { type: 'messages', event: 'sent' }, clientId(req))
  res.json({ item })
})

app.delete('/api/messages/:id', requireAuth, async (req, res) => {
  const me = userOf(req)
  await deleteMessage(me.id, String(req.params.id))
  sendToUsers([me.id], { type: 'messages', event: 'deleted' }, clientId(req))
  res.json({ ok: true, unread: await unreadCount(me.id) })
})

/* ── 공유 ───────────────────────────────────────────────── */
async function notifyShareChange(categoryId: string, extraUsers: string[] = []) {
  const ownerAndMembers = await audienceOf(categoryId, '')
  await revalidateRooms()
  sendToUsers(new Set([...ownerAndMembers, ...extraUsers]), { type: 'resync' })
}

app.get('/api/shares/:categoryId', requireAuth, async (req, res) => {
  const info = await accessInfo(userOf(req).id, String(req.params.categoryId))
  if (!info) throw new HttpError(404, '카테고리를 찾을 수 없어요.')
  res.json(info)
})

app.post('/api/shares/:categoryId', requireAuth, json, async (req, res) => {
  const categoryId = String(req.params.categoryId)
  const me = userOf(req)
  await assertOwner(me.id, categoryId)
  const { username, role } = req.body ?? {}
  if (role !== 'edit' && role !== 'view') throw new HttpError(400, '권한을 선택해 주세요.')
  if (typeof username !== 'string' || !username.trim()) throw new HttpError(400, '공유할 아이디를 입력해 주세요.')
  const target = await findUserByName(username.trim())
  if (!target) throw new HttpError(404, `"${username.trim()}" 사용자를 찾을 수 없어요.`)
  if (target.id === me.id) throw new HttpError(400, '본인에게는 공유할 수 없어요.')
  await db.run(
    `INSERT INTO shares (category_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(category_id, user_id) DO UPDATE SET role = excluded.role`,
    [categoryId, target.id, role, Date.now()],
  )
  await notifyShareChange(categoryId)
  res.json(await accessInfo(me.id, categoryId))
})

app.patch('/api/shares/:categoryId/:userId', requireAuth, json, async (req, res) => {
  const categoryId = String(req.params.categoryId)
  const me = userOf(req)
  await assertOwner(me.id, categoryId)
  const role = req.body?.role
  if (role !== 'edit' && role !== 'view') throw new HttpError(400, '권한을 선택해 주세요.')
  await db.run('UPDATE shares SET role = ? WHERE category_id = ? AND user_id = ?', [role, categoryId, String(req.params.userId)])
  await notifyShareChange(categoryId)
  res.json(await accessInfo(me.id, categoryId))
})

// 소유자가 멤버를 제거하거나, 멤버 본인이 공유에서 나감
app.delete('/api/shares/:categoryId/:userId', requireAuth, async (req, res) => {
  const categoryId = String(req.params.categoryId)
  const targetId = String(req.params.userId)
  const me = userOf(req)
  const role = await roleFor(me.id, categoryId)
  if (!role) throw new HttpError(404, '카테고리를 찾을 수 없어요.')
  if (role !== 'owner' && targetId !== me.id) throw new HttpError(403, '권한이 없어요.')
  await db.run('DELETE FROM shares WHERE category_id = ? AND user_id = ?', [categoryId, targetId])
  await notifyShareChange(categoryId, [targetId])
  res.json({ ok: true })
})

/* ── 정적 파일 (빌드 결과) ───────────────────────────────── */
const dist = join(here, '..', 'dist')
if (existsSync(dist)) {
  // 파일명에 해시가 붙는 assets는 오래 캐시, index.html은 매번 새로 받게 함
  app.use('/assets', express.static(join(dist, 'assets'), { immutable: true, maxAge: '1y' }))
  app.use(express.static(dist, { index: false }))
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(join(dist, 'index.html'))
  })
}

app.use('/api', (_req, res) => {
  res.status(404).json({ error: '없는 API예요.' })
})

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  console.error(err)
  res.status(500).json({ error: '서버 오류가 발생했어요.' })
})

await initSchema()
await migrateProfile()
const server = createServer(app)
attachRealtime(server)
server.listen(PORT, () => {
  console.log(`My Archive server: http://localhost:${PORT} (DB: ${isRemote ? 'Turso' : 'local file'})`)
})

// 배포·재시작 시 진행 중인 요청을 마치고 DB를 닫는다
function shutdown(signal: string) {
  console.log(`${signal} 수신, 서버를 종료합니다.`)
  server.close(() => {
    closeDb()
    process.exit(0)
  })
  setTimeout(() => process.exit(0), 8000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
