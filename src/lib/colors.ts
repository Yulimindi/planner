export interface PastelColor {
  id: string
  name: string
  bg: string
  fg: string
}

export const PASTELS: PastelColor[] = [
  { id: 'pink', name: 'Dusty Pink', bg: '#EDE6E5', fg: '#9C7A76' },
  { id: 'lavender', name: 'Lavender', bg: '#EAE7F0', fg: '#857C9E' },
  { id: 'sage', name: 'Sage Green', bg: '#E8EEE7', fg: '#76896F' },
  { id: 'bluegrey', name: 'Blue Grey', bg: '#E8EDF1', fg: '#71889A' },
  { id: 'butter', name: 'Butter', bg: '#F3EEDD', fg: '#9A8A5C' },
  { id: 'peach', name: 'Peach', bg: '#F3E8DF', fg: '#A3826A' },
  { id: 'mint', name: 'Mint', bg: '#E3EEEB', fg: '#6E8E86' },
  { id: 'sand', name: 'Sand', bg: '#EEEAE3', fg: '#8E8475' },
]

export const getPastel = (id: string | undefined): PastelColor =>
  PASTELS.find((p) => p.id === id) ?? PASTELS[1]

/** 테마에 맞게 파스텔 배경을 섞는다 (다크 테마에서는 연하게) */
export const tint = (id: string | undefined): string =>
  `color-mix(in srgb, ${getPastel(id).bg} var(--tint), var(--card-bg))`
