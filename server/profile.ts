/**
 * 프로필: 상대방에게 보이는 닉네임과 프로필 사진.
 * 아이디(username)는 로그인·친구 요청용으로 그대로 두고, 화면 표시에는 닉네임을 쓴다.
 */
import { db } from './db.ts'
import { HttpError } from './auth.ts'

export const MAX_NICK = 20
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024

export interface Profile {
  id: string
  username: string
  displayName: string
  /** 사진을 바꿀 때마다 바뀌는 값 (없으면 null) — 이미지 주소의 캐시 무효화에 사용 */
  avatarVer: number | null
}

interface Row {
  id: string
  username: string
  display_name: string | null
  avatar_ver: number | null
}

const toProfile = (r: Row): Profile => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name?.trim() || r.username,
  avatarVer: r.avatar_ver === null ? null : Number(r.avatar_ver),
})

/** users 테이블에 프로필 열 추가 (이미 있으면 건너뜀) */
export async function migrateProfile() {
  const cols = await db.all<{ name: string }>('PRAGMA table_info(users)')
  const names = new Set(cols.map((c) => c.name))
  if (!names.has('display_name')) await db.run('ALTER TABLE users ADD COLUMN display_name TEXT')
  if (!names.has('avatar_ver')) await db.run('ALTER TABLE users ADD COLUMN avatar_ver INTEGER')
}

export async function getProfile(id: string): Promise<Profile | null> {
  const r = await db.get<Row>('SELECT id, username, display_name, avatar_ver FROM users WHERE id = ?', [id])
  return r ? toProfile(r) : null
}

export async function getProfiles(ids: string[]): Promise<Profile[]> {
  const unique = [...new Set(ids.filter((x) => typeof x === 'string' && x.length <= 64))].slice(0, 200)
  if (!unique.length) return []
  const rows = await db.all<Row>(
    `SELECT id, username, display_name, avatar_ver FROM users WHERE id IN (${unique.map(() => '?').join(',')})`,
    unique,
  )
  return rows.map(toProfile)
}

export function validateNickname(raw: unknown): string {
  if (typeof raw !== 'string') throw new HttpError(400, '닉네임을 입력해 주세요.')
  // 줄바꿈·제어문자 제거, 공백 정리
  const v = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
  if (!v) throw new HttpError(400, '닉네임을 입력해 주세요.')
  if ([...v].length > MAX_NICK) throw new HttpError(400, `닉네임은 ${MAX_NICK}자까지 쓸 수 있어요.`)
  return v
}

export async function setNickname(id: string, nickname: string) {
  await db.run('UPDATE users SET display_name = ? WHERE id = ?', [nickname, id])
}

const avatarKey = (userId: string) => `avatar-${userId}`

export async function setAvatar(userId: string, type: string, data: Buffer): Promise<number> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(type)) throw new HttpError(400, 'PNG, JPG, WEBP, GIF 이미지만 쓸 수 있어요.')
  if (!data.length) throw new HttpError(400, '빈 파일이에요.')
  if (data.length > MAX_AVATAR_BYTES) throw new HttpError(400, '프로필 사진은 2MB 이하만 쓸 수 있어요.')
  const ver = Date.now()
  await db.run('INSERT OR REPLACE INTO images (id, owner, type, name, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
    avatarKey(userId), userId, type, 'avatar', new Uint8Array(data), ver,
  ])
  await db.run('UPDATE users SET avatar_ver = ? WHERE id = ?', [ver, userId])
  return ver
}

export async function removeAvatar(userId: string) {
  await db.run('DELETE FROM images WHERE id = ?', [avatarKey(userId)])
  await db.run('UPDATE users SET avatar_ver = NULL WHERE id = ?', [userId])
}

export async function readAvatar(userId: string) {
  return db.get<{ type: string; data: ArrayBuffer | Uint8Array }>('SELECT type, data FROM images WHERE id = ?', [avatarKey(userId)])
}
