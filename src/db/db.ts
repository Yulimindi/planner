import Dexie, { type EntityTable, type Table } from 'dexie'
import type { AccessInfo, Category, ChecklistItem, Column, ImageRecord, Memo, Row, SettingRecord } from './types'
import { buildSeed } from './seed'

export class ArchiveDB extends Dexie {
  categories!: EntityTable<Category, 'id'>
  memos!: EntityTable<Memo, 'id'>
  columns!: EntityTable<Column, 'id'>
  rows!: EntityTable<Row, 'id'>
  checklist!: EntityTable<ChecklistItem, 'id'>
  images!: EntityTable<ImageRecord, 'id'>
  settings!: EntityTable<SettingRecord, 'key'>
  access!: EntityTable<AccessInfo, 'categoryId'>

  constructor() {
    super('my-archive')
    this.version(1).stores({
      categories: 'id, order, updatedAt',
      memos: 'id, categoryId, createdAt, updatedAt, *tags',
      columns: 'id, categoryId, order',
      rows: 'id, categoryId, order, updatedAt',
      checklist: 'id, categoryId, order',
      images: 'id',
      settings: 'key',
    })
    // v2: 계정 동기화 — 카테고리별 권한 정보(서버에서 받아오는 로컬 전용 테이블)
    this.version(2).stores({
      access: 'categoryId',
    })
  }
}

export const db = new ArchiveDB()

export async function writeSeed(tx: { table: (name: string) => Table }) {
  const seed = buildSeed()
  await tx.table('categories').bulkAdd(seed.categories)
  await tx.table('columns').bulkAdd(seed.columns)
  await tx.table('memos').bulkAdd(seed.memos)
}

/** 기본 예시 카테고리를 추가한다. 동기화 훅을 거쳐 서버에도 저장된다. */
export async function seedDefaults() {
  await db.transaction('rw', db.categories, db.columns, db.memos, () => writeSeed(db))
}
