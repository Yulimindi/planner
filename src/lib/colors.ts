export interface PastelColor {
  id: string
  name: string
  /** 아이콘 배경·칩 등 기본 파스텔 */
  bg: string
  /** 아이콘·글자에 쓰는 차분한 진한 색 */
  fg: string
}

/** 채도를 낮춘 포인트 컬러. id는 저장 데이터에 쓰이므로 바꾸지 않는다. */
export const PASTELS: PastelColor[] = [
  { id: 'pink', name: 'Dusty Pink', bg: '#F3E3E1', fg: '#A5716B' },
  { id: 'lavender', name: 'Lavender', bg: '#EAE6F2', fg: '#7D719A' },
  { id: 'sage', name: 'Sage Green', bg: '#E4ECE2', fg: '#6C8364' },
  { id: 'bluegrey', name: 'Blue Grey', bg: '#E3EAF0', fg: '#688195' },
  { id: 'butter', name: 'Butter', bg: '#F2ECDA', fg: '#93814F' },
  { id: 'peach', name: 'Peach', bg: '#F5E7DC', fg: '#A07759' },
  { id: 'mint', name: 'Mint', bg: '#E0ECE8', fg: '#5E8277' },
  { id: 'sand', name: 'Sand', bg: '#EDE8E0', fg: '#857969' },
]

export const getPastel = (id: string | undefined): PastelColor =>
  PASTELS.find((p) => p.id === id) ?? PASTELS[1]

/** 아이콘 원·칩 배경 (다크 테마에서는 카드색에 섞여 연해짐) */
export const tint = (id: string | undefined): string =>
  `color-mix(in srgb, ${getPastel(id).bg} var(--tint), var(--card-bg))`

/** 카드 전체 배경처럼 넓은 면에 쓰는 아주 옅은 톤 */
export const wash = (id: string | undefined): string =>
  `color-mix(in srgb, ${getPastel(id).bg} var(--tint-wash), var(--card-bg))`

/** 넓은 면의 테두리 */
export const washLine = (id: string | undefined): string =>
  `color-mix(in srgb, ${getPastel(id).bg} var(--tint-line), var(--line))`

/** 태그 이름마다 고정된 파스텔 (같은 태그는 항상 같은 색) */
export function tagPastel(tag: string): PastelColor {
  let h = 0
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const order = ['pink', 'sand', 'sage', 'bluegrey', 'lavender', 'peach', 'mint', 'butter']
  return getPastel(order[h % order.length])
}
