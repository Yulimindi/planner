export type CategoryType = 'note' | 'table' | 'checklist' | 'gallery'
export type ViewMode = 'table' | 'list' | 'gallery'
export type ColumnType = 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'url' | 'image'
export type Aggregate = 'none' | 'sum' | 'avg' | 'min' | 'max' | 'count'

export interface Category {
  id: string
  name: string
  description: string
  icon: string
  color: string
  type: CategoryType
  order: number
  archived: boolean
  viewMode: ViewMode
  createdAt: number
  updatedAt: number
}

/** 메모 모양: 글 중심(note) / 사진 중심 카드(card) */
export type MemoKind = 'note' | 'card'

/** 일반 메모 / 갤러리 카드 / 빠른 메모(categoryId = null) 공용 엔티티 */
export interface Memo {
  id: string
  categoryId: string | null
  /** 없으면 카테고리 형식을 따른다 (갤러리 → card, 그 외 → note) */
  kind?: MemoKind
  title: string
  content: string
  tags: string[]
  urls: string[]
  imageIds: string[]
  favorite: boolean
  archived: boolean
  createdAt: number
  updatedAt: number
}

export interface SelectOption {
  id: string
  label: string
  color: string
}

export interface Column {
  id: string
  categoryId: string
  name: string
  type: ColumnType
  order: number
  options: SelectOption[]
  aggregate: Aggregate
}

export type CellValue = string | number | boolean | null

export interface Row {
  id: string
  categoryId: string
  cells: Record<string, CellValue>
  order: number
  createdAt: number
  updatedAt: number
}

export interface ChecklistItem {
  id: string
  categoryId: string
  text: string
  done: boolean
  dueDate: string | null
  order: number
  createdAt: number
  updatedAt: number
  completedAt: number | null
}

export interface ImageRecord {
  id: string
  blob: Blob
  name: string
  type: string
  createdAt: number
}

export type ThemeName = 'ivory' | 'mist' | 'cocoa'

export interface AppSettings {
  appName: string
  theme: ThemeName
  sidebarCollapsed: boolean
  /** 카테고리별 마지막 보기 방식 (사용자마다 따로 저장) */
  viewModes: Record<string, ViewMode>
}

export type Role = 'owner' | 'edit' | 'view'

/** 카테고리 접근 권한 정보 (서버에서 받아옴) */
export interface AccessInfo {
  categoryId: string
  role: Role
  ownerId: string
  ownerName: string
  members: { userId: string; username: string; role: 'edit' | 'view' }[]
}

export interface SettingRecord {
  key: string
  value: unknown
}

export const DEFAULT_SETTINGS: AppSettings = {
  appName: 'My Archive',
  theme: 'ivory',
  sidebarCollapsed: false,
  viewModes: {},
}

/** 한 카테고리 안에서 카드와 메모를 섞어 쓸 수 있도록 메모마다 모양을 정한다 */
export function memoKind(memo: Pick<Memo, 'kind'>, category: Pick<Category, 'type'> | null | undefined): MemoKind {
  return memo.kind ?? (category?.type === 'gallery' ? 'card' : 'note')
}

export const CATEGORY_TYPE_LABEL: Record<CategoryType, string> = {
  note: '일반 메모',
  table: '표 / 데이터베이스',
  checklist: '체크리스트',
  gallery: '갤러리',
}

export const COLUMN_TYPE_LABEL: Record<ColumnType, string> = {
  text: '텍스트',
  number: '숫자',
  date: '날짜',
  checkbox: '체크박스',
  select: '선택 항목',
  url: 'URL',
  image: '이미지',
}
