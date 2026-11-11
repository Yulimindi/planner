import type { Category, CategoryType, Column, ColumnType, Memo, SelectOption } from './types'
import { uid } from '../lib/utils'

interface SeedCat {
  name: string
  description: string
  icon: string
  color: string
  type: CategoryType
  columns?: { name: string; type: ColumnType; options?: string[]; aggregate?: Column['aggregate'] }[]
}

const OPTION_COLORS = ['lavender', 'sage', 'pink', 'bluegrey', 'butter', 'peach', 'mint', 'sand']
export const makeOptions = (labels: string[]): SelectOption[] =>
  labels.map((label, i) => ({ id: uid(), label, color: OPTION_COLORS[i % OPTION_COLORS.length] }))

const SEED: SeedCat[] = [
  { name: 'Bucket List', description: '언젠가 꼭 해보고 싶은 일들', icon: 'sparkles', color: 'lavender', type: 'checklist' },
  {
    name: 'Watch List', description: '보고 싶은 영화, 드라마, 책', icon: 'film', color: 'bluegrey', type: 'table',
    columns: [
      { name: '제목', type: 'text' },
      { name: '분류', type: 'select', options: ['영화', '드라마', '책', '애니메이션'] },
      { name: '상태', type: 'select', options: ['보고 싶음', '보는 중', '완료'] },
      { name: '평점', type: 'number', aggregate: 'avg' },
      { name: '본 날짜', type: 'date' },
    ],
  },
  { name: 'Date & Travel', description: '가고 싶은 곳, 다녀온 곳의 기록', icon: 'plane', color: 'pink', type: 'gallery' },
  { name: 'Hobby & Life', description: '취미와 일상의 소소한 기록', icon: 'coffee', color: 'sage', type: 'note' },
  {
    name: 'Money', description: '지출과 저축 기록', icon: 'wallet', color: 'butter', type: 'table',
    columns: [
      { name: '날짜', type: 'date' },
      { name: '항목', type: 'text' },
      { name: '분류', type: 'select', options: ['식비', '생활', '쇼핑', '저축', '기타'] },
      { name: '금액', type: 'number', aggregate: 'sum' },
      { name: '정산', type: 'checkbox' },
    ],
  },
  {
    name: 'Wishlist', description: '갖고 싶은 것들', icon: 'gift', color: 'peach', type: 'table',
    columns: [
      { name: '이름', type: 'text' },
      { name: '이미지', type: 'image' },
      { name: '가격', type: 'number', aggregate: 'sum' },
      { name: '링크', type: 'url' },
      { name: '구매함', type: 'checkbox' },
    ],
  },
  { name: 'Study & Ideas', description: '공부한 내용과 떠오른 아이디어', icon: 'lightbulb', color: 'mint', type: 'note' },
  { name: 'Plans', description: '해야 할 일과 계획', icon: 'calendar', color: 'sand', type: 'checklist' },
]

export function buildColumns(categoryId: string, defs: NonNullable<SeedCat['columns']>): Column[] {
  return defs.map((c, i) => ({
    id: uid(),
    categoryId,
    name: c.name,
    type: c.type,
    order: i,
    options: c.options ? makeOptions(c.options) : [],
    aggregate: c.aggregate ?? 'none',
  }))
}

export function buildSeed() {
  const t = Date.now()
  const categories: Category[] = []
  const columns: Column[] = []
  SEED.forEach((s, i) => {
    const id = uid()
    categories.push({
      id, name: s.name, description: s.description, icon: s.icon, color: s.color, type: s.type,
      order: i, archived: false, viewMode: 'table', createdAt: t, updatedAt: t,
    })
    if (s.columns) columns.push(...buildColumns(id, s.columns))
  })
  const memos: Memo[] = [
    {
      id: uid(), categoryId: null, title: 'My Archive에 오신 것을 환영해요',
      content: '떠오르는 생각은 일단 여기 빠른 메모에 적어두고, 나중에 원하는 카테고리로 옮겨보세요.\n카테고리는 사이드바 하단의 “새 카테고리”에서 직접 만들 수 있어요.',
      tags: ['시작하기'], urls: [], imageIds: [], favorite: false, archived: false, createdAt: t, updatedAt: t,
    },
  ]
  return { categories, columns, memos }
}
