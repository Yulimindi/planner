import { db, seedDefaults } from './db'
import { clearLocalSynced, ensureImage, fullSync, isSyncActive, resetRemoteOwnData, uploadImage } from '../sync/engine'
import type { Category, ChecklistItem, Column, ImageRecord, Memo, Row, SettingRecord } from './types'

export const BACKUP_FORMAT = 'my-archive-backup'
export const BACKUP_VERSION = 1

interface ImageExport {
  id: string
  name: string
  type: string
  createdAt: number
  dataUrl: string
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  data: {
    categories: Category[]
    memos: Memo[]
    columns: Column[]
    rows: Row[]
    checklist: ChecklistItem[]
    settings: SettingRecord[]
    images: ImageExport[]
  }
}

export interface BackupSummary {
  categories: number
  memos: number
  rows: number
  checklist: number
  images: number
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

export async function exportBackup(): Promise<Blob> {
  const [allCats, allMemos, allCols, allRows, allChecks, settings, allImages, access] = await Promise.all([
    db.categories.toArray(), db.memos.toArray(), db.columns.toArray(), db.rows.toArray(),
    db.checklist.toArray(), db.settings.toArray(), db.images.toArray(), db.access.toArray(),
  ])
  // 공유받은 카테고리는 내 백업에서 제외
  const foreign = new Set(access.filter((a) => a.role !== 'owner').map((a) => a.categoryId))
  const mine = <T extends { categoryId: string | null }>(list: T[]) => list.filter((x) => !x.categoryId || !foreign.has(x.categoryId))
  const categories = allCats.filter((c) => !foreign.has(c.id))
  const memos = mine(allMemos)
  const columns = mine(allCols)
  const rows = mine(allRows)
  const checklist = mine(allChecks)
  const imageCols = new Set(columns.filter((c) => c.type === 'image').map((c) => c.id))
  const usedImages = new Set<string>([
    ...memos.flatMap((m) => m.imageIds),
    ...rows.flatMap((r) => Object.entries(r.cells).filter(([k, v]) => imageCols.has(k) && typeof v === 'string').map(([, v]) => v as string)),
  ])
  // 다른 기기에서 올려 아직 이 브라우저에 없는 이미지는 받아온 뒤 포함
  const have = new Set(allImages.map((i) => i.id))
  for (const id of usedImages) if (!have.has(id)) await ensureImage(id)
  const images = (await db.images.toArray()).filter((i) => usedImages.has(i.id))
  const imgs: ImageExport[] = []
  for (const img of images) {
    imgs.push({ id: img.id, name: img.name, type: img.type, createdAt: img.createdAt, dataUrl: await blobToDataUrl(img.blob) })
  }
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { categories, memos, columns, rows, checklist, settings, images: imgs },
  }
  return new Blob([JSON.stringify(file)], { type: 'application/json' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const isArr = (v: unknown): v is unknown[] => Array.isArray(v)
const hasId = (v: unknown) => typeof v === 'object' && v !== null && typeof (v as { id?: unknown }).id === 'string'

/** JSON 파일을 읽고 구조를 검증한다. 문제가 있으면 Error를 던진다. */
export async function parseBackup(file: File): Promise<{ backup: BackupFile; summary: BackupSummary }> {
  let raw: unknown
  try {
    raw = JSON.parse(await file.text())
  } catch {
    throw new Error('JSON 형식이 올바르지 않은 파일입니다.')
  }
  const b = raw as Partial<BackupFile>
  if (!b || b.format !== BACKUP_FORMAT || typeof b.data !== 'object' || !b.data) {
    throw new Error('My Archive 백업 파일이 아닙니다.')
  }
  if ((b.version ?? 0) > BACKUP_VERSION) throw new Error('더 최신 버전의 앱에서 만든 백업 파일입니다.')
  const d = b.data
  const keys = ['categories', 'memos', 'columns', 'rows', 'checklist', 'images'] as const
  for (const k of keys) {
    const list = d[k]
    if (!isArr(list) || !list.every(hasId)) throw new Error(`백업 파일의 "${k}" 데이터가 손상되었습니다.`)
  }
  if (d.settings !== undefined && !isArr(d.settings)) throw new Error('백업 파일의 설정 데이터가 손상되었습니다.')
  const backup = { ...b, data: { ...d, settings: d.settings ?? [] } } as BackupFile
  return {
    backup,
    summary: {
      categories: d.categories.length,
      memos: d.memos.length,
      rows: d.rows.length,
      checklist: d.checklist.length,
      images: d.images.length,
    },
  }
}

/**
 * mode = 'replace': 계정의 내 데이터를 모두 지우고 백업으로 교체 (공유받은 페이지는 그대로)
 * mode = 'merge'  : 기존 데이터를 유지하고, 같은 ID는 백업 내용으로 덮어씀
 */
export async function importBackup(backup: BackupFile, mode: 'replace' | 'merge') {
  const d = backup.data
  const images: ImageRecord[] = []
  for (const img of d.images) {
    try {
      images.push({ id: img.id, name: img.name, type: img.type, createdAt: img.createdAt, blob: await dataUrlToBlob(img.dataUrl) })
    } catch {
      // 손상된 이미지는 건너뜀
    }
  }
  if (mode === 'replace') {
    if (isSyncActive()) await resetRemoteOwnData()
    await clearLocalSynced()
  }
  // 이미지는 서버에 먼저 올림
  if (isSyncActive()) {
    for (const img of images) await uploadImage(img).catch(() => undefined)
  }
  await db.transaction('rw', [db.categories, db.memos, db.columns, db.rows, db.checklist, db.images, db.settings], async () => {
    await db.categories.bulkPut(d.categories)
    await db.memos.bulkPut(d.memos)
    await db.columns.bulkPut(d.columns)
    await db.rows.bulkPut(d.rows)
    await db.checklist.bulkPut(d.checklist)
    await db.images.bulkPut(images)
    if (mode === 'replace' || !(await db.settings.get('app'))) await db.settings.bulkPut(d.settings)
  })
  if (isSyncActive()) await fullSync()
}

/** 내 데이터를 모두 지우고 기본 예시 카테고리로 초기화 (공유받은 페이지는 유지) */
export async function resetAllData() {
  if (isSyncActive()) await resetRemoteOwnData()
  await clearLocalSynced()
  await seedDefaults()
  if (isSyncActive()) await fullSync()
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.()
    if (!e) return null
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 }
  } catch {
    return null
  }
}
