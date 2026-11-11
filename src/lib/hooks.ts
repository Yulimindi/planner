import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { AccessInfo, AppSettings, Category, Memo, Role } from '../db/types'
import { ensureImage } from '../sync/engine'
import { DEFAULT_SETTINGS } from '../db/types'

export function useSettings(): AppSettings {
  const rec = useLiveQuery(() => db.settings.get('app'), [])
  return useMemo(() => ({ ...DEFAULT_SETTINGS, ...((rec?.value as Partial<AppSettings>) ?? {}) }), [rec])
}

/** 정렬된 전체 카테고리 (보관 포함). 로딩 중이면 undefined */
export function useAllCategories(): Category[] | undefined {
  return useLiveQuery(() => db.categories.orderBy('order').toArray(), [])
}

export function useActiveCategories(): Category[] | undefined {
  const all = useAllCategories()
  return useMemo(() => all?.filter((c) => !c.archived), [all])
}

/** 카테고리 id → 권한 정보. 정보가 없으면(오프라인 등) 내 카테고리로 본다 */
export function useAccessMap(): Map<string, AccessInfo> {
  const list = useLiveQuery(() => db.access.toArray(), [])
  return useMemo(() => new Map((list ?? []).map((a) => [a.categoryId, a])), [list])
}

export function roleOf(map: Map<string, AccessInfo>, categoryId: string | null | undefined): Role {
  if (!categoryId) return 'owner'
  return map.get(categoryId)?.role ?? 'owner'
}

/** 내가 소유한(보관 안 된) 카테고리 / 공유받은 카테고리 */
export function useSplitCategories() {
  const cats = useActiveCategories()
  const access = useAccessMap()
  return useMemo(() => {
    if (!cats) return { owned: undefined, shared: undefined }
    return {
      owned: cats.filter((c) => roleOf(access, c.id) === 'owner'),
      shared: cats.filter((c) => roleOf(access, c.id) !== 'owner').sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    }
  }, [cats, access])
}

/** 메모를 옮기거나 쓸 수 있는 카테고리 (소유 + 편집 권한) */
export function useWritableCategories(): Category[] | undefined {
  const cats = useActiveCategories()
  const access = useAccessMap()
  return useMemo(() => cats?.filter((c) => roleOf(access, c.id) !== 'view'), [cats, access])
}

export function useCategoryMap(): Map<string, Category> {
  const all = useAllCategories()
  return useMemo(() => new Map((all ?? []).map((c) => [c.id, c])), [all])
}

/** 카테고리별 항목 개수 */
export function useCategoryCounts(): Record<string, number> {
  return (
    useLiveQuery(async () => {
      const counts: Record<string, number> = {}
      const add = (id: string | null) => {
        if (id) counts[id] = (counts[id] ?? 0) + 1
      }
      await db.memos.each((m) => { if (!m.archived) add(m.categoryId) })
      await db.rows.each((r) => add(r.categoryId))
      await db.checklist.each((i) => add(i.categoryId))
      return counts
    }, []) ?? {}
  )
}

/** 일반 목록에 보여도 되는 메모인가 (본인/소속 카테고리가 보관되지 않음) */
export function isVisibleMemo(m: Memo, cats: Map<string, Category>): boolean {
  if (m.archived) return false
  if (m.categoryId === null) return true
  const c = cats.get(m.categoryId)
  return !!c && !c.archived
}

/** IndexedDB에 저장된 이미지 Blob의 object URL */
export function useImageUrl(id: string | null | undefined): string | undefined {
  const rec = useLiveQuery(() => (id ? db.images.get(id) : undefined), [id])
  const [url, setUrl] = useState<string>()
  // 이 브라우저에 없으면 서버에서 받아온다
  useEffect(() => {
    if (id && rec === undefined) {
      const t = setTimeout(() => void db.images.get(id).then((r) => {
        if (!r) void ensureImage(id)
      }), 50)
      return () => clearTimeout(t)
    }
  }, [id, rec])
  useEffect(() => {
    if (!rec?.blob) {
      setUrl(undefined)
      return
    }
    const u = URL.createObjectURL(rec.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [rec])
  return url
}

/** 입력이 멈춘 뒤 콜백 실행 */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, delay = 400) {
  const fnRef = useRef(fn)
  fnRef.current = fn
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<A | null>(null)
  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (pending.current) {
      const args = pending.current
      pending.current = null
      fnRef.current(...args)
    }
  }
  useEffect(() => flush, [])
  const call = (...args: A) => {
    pending.current = args
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, delay)
  }
  return { call, flush }
}

/**
 * HTML5 드래그 앤 드롭 정렬.
 * 드롭되면 새 순서의 id 배열로 onReorder 호출.
 */
export function useDragSort(ids: string[], onReorder: (ids: string[]) => void) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const itemProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDragId(id)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id)
    },
    onDragOver: (e: React.DragEvent) => {
      if (!dragId) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (overId !== id) setOverId(id)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      if (dragId && dragId !== id) {
        const from = ids.indexOf(dragId)
        const to = ids.indexOf(id)
        if (from >= 0 && to >= 0) {
          const next = ids.slice()
          next.splice(from, 1)
          next.splice(to, 0, dragId)
          onReorder(next)
        }
      }
      setDragId(null)
      setOverId(null)
    },
    onDragEnd: () => {
      setDragId(null)
      setOverId(null)
    },
  })

  return { itemProps, dragId, overId }
}

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}
