import { db } from './db'
import type {
  AppSettings, CategoryType, Category, CellValue, ChecklistItem, Column, ColumnType, Memo, Row, ViewMode,
} from './types'
import { DEFAULT_SETTINGS } from './types'
import { buildColumns } from './seed'
import { now, uid } from '../lib/utils'
import { deleteRemoteImage, isSyncActive, uploadImage } from '../sync/engine'

/** 로컬 캐시와 서버에서 이미지 삭제 */
async function dropImages(ids: string[]) {
  if (!ids.length) return
  await db.images.bulkDelete(ids)
  ids.forEach(deleteRemoteImage)
}

/* ── Settings ───────────────────────────────────────────── */
export async function getSettings(): Promise<AppSettings> {
  const rec = await db.settings.get('app')
  return { ...DEFAULT_SETTINGS, ...((rec?.value as Partial<AppSettings>) ?? {}) }
}
export async function updateSettings(patch: Partial<AppSettings>) {
  const cur = await getSettings()
  await db.settings.put({ key: 'app', value: { ...cur, ...patch } })
}

/* ── Categories ─────────────────────────────────────────── */
export interface CategoryInput {
  name: string
  description: string
  icon: string
  color: string
  type: CategoryType
}

export async function createCategory(input: CategoryInput): Promise<string> {
  const id = uid()
  const t = now()
  await db.transaction('rw', db.categories, db.columns, async () => {
    const last = await db.categories.orderBy('order').last()
    await db.categories.add({
      id, ...input, name: input.name.trim(), order: (last?.order ?? -1) + 1,
      archived: false, viewMode: 'table', createdAt: t, updatedAt: t,
    })
    if (input.type === 'table') {
      await db.columns.bulkAdd(
        buildColumns(id, [
          { name: '이름', type: 'text' },
          { name: '메모', type: 'text' },
          { name: '완료', type: 'checkbox' },
        ]),
      )
    }
  })
  return id
}

export async function updateCategory(id: string, patch: Partial<Omit<Category, 'id' | 'type'>>) {
  await db.categories.update(id, { ...patch, updatedAt: now() })
}

/** 보기 방식은 사용자별 설정에 저장 (공유받은 카테고리에서도 각자 기억) */
export async function setCategoryView(id: string, viewMode: ViewMode) {
  const cur = await getSettings()
  await updateSettings({ viewModes: { ...cur.viewModes, [id]: viewMode } })
}

export async function reorderCategories(ids: string[]) {
  await db.transaction('rw', db.categories, async () => {
    await Promise.all(ids.map((id, i) => db.categories.update(id, { order: i })))
  })
}

export async function countCategoryItems(cat: Category): Promise<number> {
  switch (cat.type) {
    case 'note':
    case 'gallery':
      return db.memos.where('categoryId').equals(cat.id).count()
    case 'table':
      return db.rows.where('categoryId').equals(cat.id).count()
    case 'checklist':
      return db.checklist.where('categoryId').equals(cat.id).count()
  }
}

const stringIds = (vals: unknown[]): string[] => vals.filter((v): v is string => typeof v === 'string' && !!v)

export async function deleteCategory(id: string) {
  await db.transaction('rw', [db.categories, db.memos, db.columns, db.rows, db.checklist, db.images], async () => {
    const memos = await db.memos.where('categoryId').equals(id).toArray()
    const cols = await db.columns.where('categoryId').equals(id).toArray()
    const rows = await db.rows.where('categoryId').equals(id).toArray()
    const imageCols = cols.filter((c) => c.type === 'image').map((c) => c.id)
    const imageIds = [
      ...memos.flatMap((m) => m.imageIds),
      ...stringIds(rows.flatMap((r) => imageCols.map((c) => r.cells[c]))),
    ]
    await dropImages(imageIds)
    await db.memos.where('categoryId').equals(id).delete()
    await db.columns.where('categoryId').equals(id).delete()
    await db.rows.where('categoryId').equals(id).delete()
    await db.checklist.where('categoryId').equals(id).delete()
    await db.categories.delete(id)
  })
}

/* ── Memos (note / gallery / quick) ─────────────────────── */
export async function createMemo(categoryId: string | null, data: Partial<Memo> = {}): Promise<string> {
  const id = uid()
  const t = now()
  await db.memos.add({
    id, categoryId, title: '', content: '', tags: [], urls: [], imageIds: [], favorite: false, archived: false,
    createdAt: t, updatedAt: t, ...data,
  })
  return id
}

export async function updateMemo(id: string, patch: Partial<Omit<Memo, 'id'>>) {
  await db.memos.update(id, { ...patch, updatedAt: now() })
}

/** 즐겨찾기·보관 토글은 수정일을 바꾸지 않는다 */
export async function setMemoFlag(id: string, patch: Pick<Partial<Memo>, 'favorite' | 'archived'>) {
  await db.memos.update(id, patch)
}

export async function deleteMemo(id: string) {
  await db.transaction('rw', db.memos, db.images, async () => {
    const m = await db.memos.get(id)
    if (m) await dropImages(m.imageIds)
    await db.memos.delete(id)
  })
}

/** 빠른 메모 등을 다른 카테고리로 이동. 표/체크리스트로는 형식 변환 후 이동 */
export async function moveMemoToCategory(memoId: string, target: Category | null) {
  const memo = await db.memos.get(memoId)
  if (!memo) throw new Error('메모를 찾을 수 없습니다.')
  if (!target || target.type === 'note' || target.type === 'gallery') {
    await db.memos.update(memoId, { categoryId: target?.id ?? null, updatedAt: now() })
    return
  }
  const label = memo.title.trim() || memo.content.trim().split('\n')[0] || '제목 없음'
  if (target.type === 'checklist') {
    await db.transaction('rw', db.checklist, db.memos, db.images, async () => {
      await addChecklistItem(target.id, label)
      await dropImages(memo.imageIds)
      await db.memos.delete(memoId)
    })
    return
  }
  // table: 첫 텍스트 열 = 제목, 두 번째 텍스트 열 = 본문
  await db.transaction('rw', db.columns, db.rows, db.memos, db.images, async () => {
    const cols = await db.columns.where('categoryId').equals(target.id).sortBy('order')
    const textCols = cols.filter((c) => c.type === 'text')
    const cells: Record<string, CellValue> = {}
    if (textCols[0]) cells[textCols[0].id] = label
    if (textCols[1] && memo.content.trim() && memo.title.trim()) cells[textCols[1].id] = memo.content.trim()
    const urlCol = cols.find((c) => c.type === 'url')
    if (urlCol && memo.urls[0]) cells[urlCol.id] = memo.urls[0]
    const imgCol = cols.find((c) => c.type === 'image')
    const keepImage = !!(imgCol && memo.imageIds[0])
    if (imgCol && keepImage) cells[imgCol.id] = memo.imageIds[0]
    await addRow(target.id, cells)
    await dropImages(keepImage ? memo.imageIds.slice(1) : memo.imageIds)
    await db.memos.delete(memoId)
  })
}

/* ── Images ─────────────────────────────────────────────── */
const MAX_DIM = 1800

async function downscale(file: File): Promise<Blob> {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height))
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
      bmp.close()
      return file
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close()
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.86))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}

export async function saveImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 첨부할 수 있습니다.')
  if (file.size > 25 * 1024 * 1024) throw new Error('25MB 이하의 이미지만 첨부할 수 있습니다.')
  const blob = await downscale(file)
  const id = uid()
  const rec = { id, blob, name: file.name, type: blob.type || file.type, createdAt: now() }
  if (isSyncActive()) {
    try {
      await uploadImage(rec)
    } catch {
      throw new Error('이미지를 서버에 올리지 못했어요. 연결 상태를 확인해 주세요.')
    }
  }
  await db.images.add(rec)
  return id
}

export async function deleteImage(id: string) {
  await dropImages([id])
}

/* ── Table columns / rows ───────────────────────────────── */
export async function addColumn(categoryId: string, name: string, type: ColumnType): Promise<string> {
  const id = uid()
  const cols = await db.columns.where('categoryId').equals(categoryId).sortBy('order')
  await db.columns.add({
    id, categoryId, name, type, order: (cols.at(-1)?.order ?? -1) + 1, options: [], aggregate: 'none',
  })
  return id
}

function convertCell(v: CellValue | undefined, from: Column, to: ColumnType, opts: Column['options']): CellValue {
  if (v === undefined || v === null || v === '') return null
  if (from.type === 'image' || to === 'image') return null
  const text = from.type === 'select' ? (from.options.find((o) => o.id === v)?.label ?? '') : String(v)
  switch (to) {
    case 'number': {
      const n = Number(text.replace(/[^\d.-]/g, ''))
      return Number.isFinite(n) && text.trim() !== '' ? n : null
    }
    case 'checkbox':
      return v === true || ['true', '1', 'y', 'yes', 'o', '완료'].includes(text.toLowerCase())
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
    case 'select':
      return opts.find((o) => o.label === text)?.id ?? null
    default:
      return text
  }
}

export async function updateColumn(id: string, patch: Partial<Omit<Column, 'id' | 'categoryId'>>) {
  await db.transaction('rw', db.columns, db.rows, db.images, async () => {
    const col = await db.columns.get(id)
    if (!col) return
    const next = { ...patch }
    // 유형이 바뀌면 기존 값을 새 유형에 맞게 변환
    if (next.type && next.type !== col.type) {
      const target = next.type
      const rows = await db.rows.where('categoryId').equals(col.categoryId).toArray()
      // 선택 항목으로 바꿀 때 기존 텍스트 값을 선택지로 자동 생성
      if (target === 'select' && !next.options?.length) {
        const labels = [...new Set(rows.map((r) => r.cells[id]).filter((v) => v !== null && v !== undefined && v !== '' && typeof v !== 'boolean').map(String))].slice(0, 30)
        const colors = ['lavender', 'sage', 'pink', 'bluegrey', 'butter', 'peach', 'mint', 'sand']
        next.options = labels.map((label, i) => ({ id: uid(), label, color: colors[i % colors.length] }))
      }
      if (col.type === 'image') await dropImages(stringIds(rows.map((r) => r.cells[id])))
      const opts = next.options ?? col.options
      await Promise.all(
        rows.map((r) => db.rows.update(r.id, { cells: { ...r.cells, [id]: convertCell(r.cells[id], col, target, opts) } })),
      )
      if (target !== 'number') next.aggregate = 'none'
    }
    // 삭제된 선택지를 참조하는 셀 정리
    if (next.options && (next.type ?? col.type) === 'select') {
      const valid = new Set(next.options.map((o) => o.id))
      const rows = await db.rows.where('categoryId').equals(col.categoryId).toArray()
      await Promise.all(
        rows
          .filter((r) => typeof r.cells[id] === 'string' && !valid.has(r.cells[id] as string))
          .map((r) => db.rows.update(r.id, { cells: { ...r.cells, [id]: null } })),
      )
    }
    await db.columns.update(id, next)
  })
}

export async function reorderColumns(ids: string[]) {
  await db.transaction('rw', db.columns, async () => {
    await Promise.all(ids.map((id, i) => db.columns.update(id, { order: i })))
  })
}

export async function deleteColumn(id: string) {
  await db.transaction('rw', db.columns, db.rows, db.images, async () => {
    const col = await db.columns.get(id)
    if (!col) return
    const rows = await db.rows.where('categoryId').equals(col.categoryId).toArray()
    if (col.type === 'image') await dropImages(stringIds(rows.map((r) => r.cells[id])))
    await Promise.all(
      rows.map((r) => {
        const cells = { ...r.cells }
        delete cells[id]
        return db.rows.update(r.id, { cells })
      }),
    )
    await db.columns.delete(id)
  })
}

export async function addRow(categoryId: string, cells: Record<string, CellValue> = {}): Promise<string> {
  const id = uid()
  const t = now()
  const rows = await db.rows.where('categoryId').equals(categoryId).sortBy('order')
  await db.rows.add({ id, categoryId, cells, order: (rows.at(-1)?.order ?? -1) + 1, createdAt: t, updatedAt: t })
  return id
}

export async function updateCell(row: Row, columnId: string, value: CellValue) {
  // 셀 하나만 keypath로 수정 → 여러 사람이 같은 행의 다른 셀을 동시에 고쳐도 덮어쓰지 않음
  await db.rows.update(row.id, { [`cells.${columnId}`]: value, updatedAt: now() } as Partial<Row>)
}

export async function reorderRows(ids: string[]) {
  await db.transaction('rw', db.rows, async () => {
    await Promise.all(ids.map((id, i) => db.rows.update(id, { order: i })))
  })
}

export async function deleteRow(row: Row, columns: Column[]) {
  const imgIds = stringIds(columns.filter((c) => c.type === 'image').map((c) => row.cells[c.id]))
  await db.transaction('rw', db.rows, db.images, async () => {
    await dropImages(imgIds)
    await db.rows.delete(row.id)
  })
}

/* ── Checklist ──────────────────────────────────────────── */
export async function addChecklistItem(categoryId: string, text: string, dueDate: string | null = null) {
  const items = await db.checklist.where('categoryId').equals(categoryId).sortBy('order')
  const t = now()
  await db.checklist.add({
    id: uid(), categoryId, text: text.trim(), done: false, dueDate, order: (items.at(-1)?.order ?? -1) + 1,
    createdAt: t, updatedAt: t, completedAt: null,
  })
}

export async function updateChecklistItem(id: string, patch: Partial<Omit<ChecklistItem, 'id' | 'categoryId'>>) {
  const extra: Partial<ChecklistItem> = {}
  if (patch.done !== undefined) extra.completedAt = patch.done ? now() : null
  await db.checklist.update(id, { ...patch, ...extra, updatedAt: now() })
}

export async function deleteChecklistItem(id: string) {
  await db.checklist.delete(id)
}

export async function reorderChecklist(ids: string[]) {
  await db.transaction('rw', db.checklist, async () => {
    await Promise.all(ids.map((id, i) => db.checklist.update(id, { order: i })))
  })
}
