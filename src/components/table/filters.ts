import type { CellValue, Column, ColumnType } from '../../db/types'
import { cellToText } from './cells'

export type FilterOp =
  | 'contains' | 'notContains' | 'empty' | 'notEmpty'
  | 'eq' | 'gt' | 'lt'
  | 'before' | 'after'
  | 'checked' | 'unchecked'
  | 'is' | 'isNot'

export interface Filter {
  id: string
  columnId: string
  op: FilterOp
  value: string
}

export const OPS_BY_TYPE: Record<ColumnType, { op: FilterOp; label: string; needsValue: boolean }[]> = {
  text: [
    { op: 'contains', label: '포함', needsValue: true },
    { op: 'notContains', label: '포함하지 않음', needsValue: true },
    { op: 'empty', label: '비어 있음', needsValue: false },
    { op: 'notEmpty', label: '비어 있지 않음', needsValue: false },
  ],
  url: [
    { op: 'contains', label: '포함', needsValue: true },
    { op: 'empty', label: '비어 있음', needsValue: false },
    { op: 'notEmpty', label: '비어 있지 않음', needsValue: false },
  ],
  number: [
    { op: 'eq', label: '=', needsValue: true },
    { op: 'gt', label: '>', needsValue: true },
    { op: 'lt', label: '<', needsValue: true },
    { op: 'empty', label: '비어 있음', needsValue: false },
    { op: 'notEmpty', label: '비어 있지 않음', needsValue: false },
  ],
  date: [
    { op: 'eq', label: '같은 날', needsValue: true },
    { op: 'before', label: '이전', needsValue: true },
    { op: 'after', label: '이후', needsValue: true },
    { op: 'empty', label: '비어 있음', needsValue: false },
    { op: 'notEmpty', label: '비어 있지 않음', needsValue: false },
  ],
  checkbox: [
    { op: 'checked', label: '체크됨', needsValue: false },
    { op: 'unchecked', label: '체크 안 됨', needsValue: false },
  ],
  select: [
    { op: 'is', label: '같음', needsValue: true },
    { op: 'isNot', label: '같지 않음', needsValue: true },
    { op: 'empty', label: '비어 있음', needsValue: false },
    { op: 'notEmpty', label: '비어 있지 않음', needsValue: false },
  ],
  image: [
    { op: 'notEmpty', label: '이미지 있음', needsValue: false },
    { op: 'empty', label: '이미지 없음', needsValue: false },
  ],
}

const isEmpty = (v: CellValue | undefined) => v === null || v === undefined || v === '' || v === false

export function matchFilter(v: CellValue | undefined, col: Column, f: Filter): boolean {
  const def = OPS_BY_TYPE[col.type].find((o) => o.op === f.op)
  if (!def) return true
  if (def.needsValue && f.value.trim() === '') return true // 값이 없으면 필터 미적용
  switch (f.op) {
    case 'empty':
      return isEmpty(v)
    case 'notEmpty':
      return !isEmpty(v)
    case 'checked':
      return v === true
    case 'unchecked':
      return v !== true
    case 'contains':
      return cellToText(v, col).toLowerCase().includes(f.value.toLowerCase())
    case 'notContains':
      return !cellToText(v, col).toLowerCase().includes(f.value.toLowerCase())
    case 'is':
      return v === f.value
    case 'isNot':
      return v !== f.value
    case 'eq':
      return col.type === 'number' ? typeof v === 'number' && v === Number(f.value) : v === f.value
    case 'gt':
      return typeof v === 'number' && v > Number(f.value)
    case 'lt':
      return typeof v === 'number' && v < Number(f.value)
    case 'before':
      return typeof v === 'string' && !!v && v < f.value
    case 'after':
      return typeof v === 'string' && !!v && v > f.value
  }
}
