/**
 * 계정 동기화 엔진
 *
 * - 로컬 IndexedDB(Dexie)를 화면의 데이터 원본(캐시)으로 그대로 쓴다.
 * - Dexie 훅으로 모든 로컬 변경을 잡아 트랜잭션이 끝나면 서버(/api/ops)로 보낸다.
 * - 다른 사람/다른 탭의 변경은 WebSocket으로 받아 로컬에 적용한다(이때는 다시 보내지 않음).
 * - 보내지 못한 변경은 localStorage의 outbox에 보관했다가 다시 연결되면 보낸다.
 */
import type { Transaction } from 'dexie'
import { db, seedDefaults } from '../db/db'
import type { AccessInfo, ImageRecord } from '../db/types'
import { CLIENT_ID, ApiError, api, type AuthUser } from './api'

export const SYNCED = ['categories', 'memos', 'columns', 'rows', 'checklist', 'settings'] as const
export type SyncTable = (typeof SYNCED)[number]

type Json = Record<string, unknown>
export type Op =
  | { t: SyncTable; op: 'put'; id: string; data: Json }
  | { t: SyncTable; op: 'patch'; id: string; mods: Json }
  | { t: SyncTable; op: 'del'; id: string }

interface SyncPayload {
  docs: Record<Exclude<SyncTable, 'settings'>, Json[]>
  access: AccessInfo[]
  settings: Json | null
}

const LS_USER = 'ma:user'
const LS_OUTBOX = 'ma:outbox'

/* ── 상태 (연결 표시용) ─────────────────────────────────── */
export type ConnState = 'online' | 'connecting' | 'offline'
let conn: ConnState = 'connecting'
let pendingCount = 0
const stateListeners = new Set<() => void>()
const emitState = () => stateListeners.forEach((l) => l())
export const syncState = {
  subscribe: (fn: () => void) => {
    stateListeners.add(fn)
    return () => {
      stateListeners.delete(fn)
    }
  },
  get: () => `${conn}|${pendingCount}`,
}
function setConn(c: ConnState) {
  if (conn !== c) {
    conn = c
    emitState()
  }
}

/* ── 로컬 변경 캡처 ─────────────────────────────────────── */
let active = false
let userId: string | null = null
const REMOTE = '__maRemote'
const OPS = '__maOps'

type TxBag = Transaction & { parent?: TxBag; [REMOTE]?: boolean; [OPS]?: Op[] }

function rootTx(t: TxBag): TxBag {
  let cur = t
  while (cur.parent) cur = cur.parent
  return cur
}

function capture(trans: Transaction, op: Op) {
  if (!active) return
  const root = rootTx(trans as TxBag)
  if (root[REMOTE]) return
  let list = root[OPS]
  if (!list) {
    list = root[OPS] = []
    const ops = list
    root.on('complete', () => enqueue(ops))
  }
  list.push(op)
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

let hooksInstalled = false
function installHooks() {
  if (hooksInstalled) return
  hooksInstalled = true
  for (const name of SYNCED) {
    const table = db.table(name)
    const keyOf = (obj: Json) => String(name === 'settings' ? obj.key : obj.id)
    table.hook('creating', function (primKey, obj, trans) {
      capture(trans, { t: name, op: 'put', id: primKey != null ? String(primKey) : keyOf(obj), data: clone(obj) })
    })
    table.hook('updating', function (mods, primKey, _obj, trans) {
      capture(trans, { t: name, op: 'patch', id: String(primKey), mods: clone(mods) as Json })
    })
    table.hook('deleting', function (primKey, _obj, trans) {
      capture(trans, { t: name, op: 'del', id: String(primKey) })
    })
  }
}

/** 동기화 훅을 건너뛰고(서버로 다시 보내지 않고) 로컬에만 쓰는 트랜잭션 */
async function remoteTx(fn: () => Promise<void>) {
  await db.transaction('rw', [...SYNCED.map((n) => db.table(n)), db.access, db.images], async (tx) => {
    ;(tx as TxBag)[REMOTE] = true
    await fn()
  })
}

/* ── outbox & 전송 ──────────────────────────────────────── */
let outbox: Op[] = []
let flushing: Promise<void> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let needResync = false

function persistOutbox() {
  pendingCount = outbox.length
  emitState()
  try {
    if (outbox.length) localStorage.setItem(LS_OUTBOX, JSON.stringify({ userId, ops: outbox }))
    else localStorage.removeItem(LS_OUTBOX)
  } catch {
    /* 저장 공간 부족 등은 무시 (메모리에는 남아 있음) */
  }
}

function enqueue(ops: Op[]) {
  if (!ops.length) return
  outbox.push(...ops)
  persistOutbox()
  void flush()
}

export function flush(): Promise<void> {
  if (flushing) return flushing
  flushing = (async () => {
    // 반드시 한 번 양보한다: 보낼 것이 없어 동기적으로 끝나면 finally가 할당보다 먼저 실행되어
    // flushing이 끝난 Promise로 남고, 이후 flush()가 영원히 아무것도 보내지 않게 된다.
    await Promise.resolve()
    try {
      while (outbox.length && active) {
        const batch = outbox.slice(0, 300)
        const res = await api<{ ok: boolean; rejected: string[] }>('/api/ops', { body: { ops: batch } })
        outbox = outbox.slice(batch.length)
        persistOutbox()
        if (res.rejected.length) needResync = true
      }
      if (needResync && active) {
        needResync = false
        await fullSync()
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) {
        setConn('offline')
        if (retryTimer) clearTimeout(retryTimer)
        retryTimer = setTimeout(() => void flush(), 4000)
      } else if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401) {
        // 서버가 받아들일 수 없는 변경 → 버리고 서버 상태로 되돌림
        outbox = []
        persistOutbox()
        await fullSync().catch(() => undefined)
      }
    } finally {
      flushing = null
    }
  })()
  return flushing
}

/* ── 서버 → 로컬 ────────────────────────────────────────── */
async function applyRemoteOps(ops: Op[]) {
  await remoteTx(async () => {
    for (const op of ops) {
      const table = db.table(op.t)
      if (op.op === 'put') await table.put(op.data)
      else if (op.op === 'patch') await table.update(op.id, op.mods)
      else await table.delete(op.id)
    }
  })
}

async function replaceLocal(data: SyncPayload, clearImages: boolean) {
  await remoteTx(async () => {
    await Promise.all([...SYNCED.map((n) => db.table(n).clear()), db.access.clear(), clearImages ? db.images.clear() : Promise.resolve()])
    for (const [t, list] of Object.entries(data.docs)) await db.table(t).bulkPut(list)
    if (data.settings) await db.settings.put(data.settings as never)
    await db.access.bulkPut(data.access)
  })
}

let syncing: Promise<void> | null = null
/** 서버의 최신 상태로 로컬 캐시를 교체한다 (보내지 않은 변경을 먼저 보냄) */
export function fullSync(): Promise<void> {
  if (syncing) return syncing
  syncing = (async () => {
    await Promise.resolve() // flush()와 같은 이유
    try {
      if (outbox.length) await flush()
      const data = await api<SyncPayload>('/api/sync')
      if (outbox.length) return // 그 사이 새 변경이 생기면 다음 기회에
      await replaceLocal(data, false)
    } finally {
      syncing = null
    }
  })()
  return syncing
}

/* ── 이미지 ─────────────────────────────────────────────── */
export async function uploadImage(rec: Pick<ImageRecord, 'id' | 'blob' | 'name' | 'type'>) {
  await api(`/api/images/${rec.id}`, {
    method: 'PUT',
    raw: rec.blob,
    headers: { 'Content-Type': rec.type || 'image/png', 'X-File-Name': encodeURIComponent(rec.name) },
  })
}

export function deleteRemoteImage(id: string) {
  if (!active) return
  api(`/api/images/${id}`, { method: 'DELETE' }).catch(() => undefined)
}

const fetchingImages = new Set<string>()
const missingImages = new Set<string>()
/** 로컬에 없는 이미지를 서버에서 받아 캐시한다 */
export async function ensureImage(id: string) {
  if (!active || fetchingImages.has(id) || missingImages.has(id)) return
  fetchingImages.add(id)
  try {
    const blob = await api<Blob>(`/api/images/${id}`)
    await remoteTx(async () => {
      await db.images.put({ id, blob, name: 'image', type: blob.type, createdAt: Date.now() })
    })
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) missingImages.add(id)
  } finally {
    fetchingImages.delete(id)
  }
}

/* ── WebSocket (실시간 변경 + 마우스) ───────────────────── */
type Msg = { type: string; [k: string]: unknown }
const presenceListeners = new Set<(m: Msg) => void>()
export const onPresence = (fn: (m: Msg) => void) => {
  presenceListeners.add(fn)
  return () => {
    presenceListeners.delete(fn)
  }
}
const reconnectListeners = new Set<() => void>()
export const onReconnect = (fn: () => void) => {
  reconnectListeners.add(fn)
  return () => {
    reconnectListeners.delete(fn)
  }
}

let ws: WebSocket | null = null
let wsTimer: ReturnType<typeof setTimeout> | null = null
let backoff = 1000

function connect() {
  if (!active) return
  setConn('connecting')
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const sock = new WebSocket(`${proto}://${location.host}/ws?cid=${CLIENT_ID}`)
  ws = sock
  sock.onopen = () => {
    backoff = 1000
    setConn('online')
    // 연결이 끊긴 동안 놓친 변경을 따라잡는다
    void flush().then(() => fullSync()).catch(() => undefined)
    reconnectListeners.forEach((l) => l())
  }
  sock.onmessage = (ev) => {
    let msg: Msg
    try {
      msg = JSON.parse(String(ev.data)) as Msg
    } catch {
      return
    }
    if (msg.type === 'ops') void applyRemoteOps(msg.ops as Op[]).catch(() => fullSync())
    else if (msg.type === 'resync') void fullSync().catch(() => undefined)
    else presenceListeners.forEach((l) => l(msg))
  }
  sock.onclose = () => {
    if (ws !== sock) return
    ws = null
    if (!active) return
    setConn('offline')
    wsTimer = setTimeout(connect, backoff)
    backoff = Math.min(backoff * 2, 15000)
  }
}

export function sendRealtime(msg: Msg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

/* ── 세션 시작 / 종료 ───────────────────────────────────── */
async function uploadLocalData() {
  const ops: Op[] = []
  for (const t of SYNCED) {
    const rows = (await db.table(t).toArray()) as Json[]
    for (const r of rows) ops.push({ t, op: 'put', id: String(t === 'settings' ? r.key : r.id), data: clone(r) })
  }
  const images = await db.images.toArray()
  for (const img of images) await uploadImage(img).catch(() => undefined)
  enqueue(ops)
  await flush()
}

/**
 * 로그인 직후 호출. 서버 데이터를 받아 로컬 캐시를 맞추고 실시간 연결을 연다.
 * - 새 계정이고 이 브라우저에 로그인 기능 이전의 로컬 기록이 있으면 계정으로 올린다.
 * - 그 외 새 계정은 기본 예시 카테고리를 만든다.
 */
export async function startSession(user: AuthUser, opts: { offline?: boolean } = {}) {
  installHooks()
  const lastUser = localStorage.getItem(LS_USER)
  userId = user.id

  // 같은 사용자가 보내지 못한 변경 복원
  try {
    const saved = JSON.parse(localStorage.getItem(LS_OUTBOX) ?? 'null') as { userId: string; ops: Op[] } | null
    outbox = saved && saved.userId === user.id ? saved.ops : []
  } catch {
    outbox = []
  }
  persistOutbox()
  active = true

  if (opts.offline) {
    setConn('offline')
    wsTimer = setTimeout(connect, 2000)
    return
  }

  await flush()
  const data = await api<SyncPayload>('/api/sync')
  const serverEmpty = !data.docs.categories.length && !data.docs.memos.length && !data.settings
  if (serverEmpty) {
    const legacy = !lastUser && (await db.categories.count()) > 0
    if (legacy) {
      await uploadLocalData()
      await fullSync()
    } else {
      await replaceLocal(data, lastUser !== user.id)
      await seedDefaults()
      await flush()
    }
  } else {
    await replaceLocal(data, lastUser !== user.id)
  }
  localStorage.setItem(LS_USER, user.id)
  localStorage.setItem(`${LS_USER}:name`, user.username)
  connect()
}

/** 로그아웃: 연결을 닫고 이 브라우저의 캐시를 비운다 */
export async function endSession(opts: { keepCache?: boolean } = {}) {
  active = false
  userId = null
  if (wsTimer) clearTimeout(wsTimer)
  if (retryTimer) clearTimeout(retryTimer)
  const sock = ws
  ws = null
  sock?.close()
  if (!opts.keepCache) {
    // keepCache일 때는 보내지 못한 변경을 localStorage에 남겨 다시 로그인하면 이어서 보낸다
    outbox = []
    persistOutbox()
    await remoteTx(async () => {
      await Promise.all([...SYNCED.map((n) => db.table(n).clear()), db.access.clear(), db.images.clear()])
    })
    localStorage.removeItem(LS_USER)
    localStorage.removeItem(`${LS_USER}:name`)
  }
  setConn('connecting')
}

/** 서버 연결 없이 시작할 수 있도록 마지막 로그인 사용자 정보 */
export function cachedUser(): AuthUser | null {
  const id = localStorage.getItem(LS_USER)
  const username = localStorage.getItem(`${LS_USER}:name`)
  return id && username ? { id, username } : null
}

/** 계정의 내 데이터를 서버에서 모두 지운다 (백업 덮어쓰기·초기화용). 로컬은 호출한 쪽에서 처리 */
export async function resetRemoteOwnData() {
  await flush()
  await api('/api/reset', { method: 'POST' })
}

/** 서버로 보내지 않고 로컬 동기화 테이블을 비운다 */
export async function clearLocalSynced() {
  await remoteTx(async () => {
    await Promise.all([...SYNCED.map((n) => db.table(n).clear()), db.access.clear(), db.images.clear()])
  })
}

export const isSyncActive = () => active
