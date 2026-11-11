import type { Server } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { nameOf, userFromRequest, type User } from './auth.ts'
import { roleFor } from './docs.ts'

interface Client {
  ws: WebSocket
  cid: string
  user: User
  room: string | null
  categoryId: string | null
  joinSeq: number
}

const clients = new Set<Client>()

function send(c: Client, msg: unknown) {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg))
}

/** 지정한 사용자들의 모든 연결(탭)에 메시지 전송. exceptCid 연결은 제외 */
/** 접속한 모든 사람에게 (프로필 변경 알림 등 민감하지 않은 정보만) */
export function sendToAll(msg: unknown) {
  for (const c of clients) send(c, msg)
}

/** 프로필이 바뀐 사용자의 열려 있는 연결에도 새 이름 반영 */
export function updateClientUser(id: string, patch: Partial<User>) {
  for (const c of clients) if (c.user.id === id) c.user = { ...c.user, ...patch }
}

export function sendToUsers(userIds: Iterable<string>, msg: unknown, exceptCid?: string) {
  const ids = new Set(userIds)
  for (const c of clients) if (ids.has(c.user.id) && c.cid !== exceptCid) send(c, msg)
}

function roomPeers(room: string, except?: Client) {
  return [...clients].filter((c) => c.room === room && c !== except)
}

function leaveRoom(c: Client) {
  if (!c.room) return
  for (const p of roomPeers(c.room, c)) send(p, { type: 'gone', cid: c.cid })
  c.room = null
  c.categoryId = null
}

/** 공유가 해제되는 등 권한이 바뀌면 해당 방에서 내보냄 */
export async function revalidateRooms() {
  for (const c of [...clients]) {
    const catId = c.categoryId
    if (catId && !(await roleFor(c.user.id, catId)) && c.categoryId === catId) {
      leaveRoom(c)
      send(c, { type: 'kicked' })
    }
  }
}

export function attachRealtime(server: Server) {
  const wss = new WebSocketServer({ noServer: true })

  // 프록시(Render 등)가 유휴 연결을 끊지 않도록 주기적으로 ping, 응답 없는 연결은 정리
  const alive = new WeakMap<WebSocket, boolean>()
  const heartbeat = setInterval(() => {
    for (const c of clients) {
      if (alive.get(c.ws) === false) {
        c.ws.terminate()
        continue
      }
      alive.set(c.ws, false)
      c.ws.ping()
    }
  }, 25_000)
  heartbeat.unref()
  server.on('close', () => clearInterval(heartbeat))

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/ws') return
    let user: User | null = null
    try {
      user = await userFromRequest(req)
    } catch {
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n')
      socket.destroy()
      return
    }
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    const cid = (url.searchParams.get('cid') ?? '').slice(0, 64) || Math.random().toString(36).slice(2)
    wss.handleUpgrade(req, socket, head, (ws) => {
      const me = user!
      const client: Client = { ws, cid, user: me, room: null, categoryId: null, joinSeq: 0 }
      clients.add(client)
      alive.set(ws, true)
      ws.on('pong', () => alive.set(ws, true))
      send(client, { type: 'hello', cid })

      ws.on('message', (raw) => {
        let msg: { type?: string; room?: string; categoryId?: string; x?: number; y?: number } = {}
        try {
          msg = JSON.parse(String(raw))
        } catch {
          return
        }
        switch (msg.type) {
          case 'join': {
            leaveRoom(client)
            const seq = ++client.joinSeq
            const catId = typeof msg.categoryId === 'string' ? msg.categoryId : ''
            const room = typeof msg.room === 'string' ? msg.room.slice(0, 300) : ''
            if (!catId || !room) return
            void roleFor(me.id, catId).then((role) => {
              // 권한 확인 중에 다른 방으로 옮겼거나 나갔으면 무시
              if (!role || seq !== client.joinSeq || ws.readyState !== WebSocket.OPEN) return
              client.room = `${catId}|${room}`
              client.categoryId = catId
              const peers = roomPeers(client.room, client)
              send(client, { type: 'peers', peers: peers.map((p) => ({ cid: p.cid, uid: p.user.id, name: nameOf(p.user) })) })
              for (const p of peers) send(p, { type: 'joined', cid, uid: me.id, name: nameOf(me) })
            }).catch(() => undefined)
            break
          }
          case 'leave':
            client.joinSeq++
            leaveRoom(client)
            break
          case 'cursor': {
            if (!client.room) return
            const valid = typeof msg.x === 'number' && typeof msg.y === 'number' && Number.isFinite(msg.x) && Number.isFinite(msg.y)
            const payload = { type: 'cursor', cid, uid: me.id, name: nameOf(me), x: valid ? msg.x : null, y: valid ? msg.y : null }
            for (const p of roomPeers(client.room, client)) send(p, payload)
            break
          }
          case 'ping':
            send(client, { type: 'pong' })
            break
        }
      })

      ws.on('close', () => {
        leaveRoom(client)
        clients.delete(client)
      })
    })
  })
}
