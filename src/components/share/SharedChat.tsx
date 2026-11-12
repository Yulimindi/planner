/**
 * 공유 페이지 대화창을 레이아웃 단에서 관리한다.
 * 카테고리 메인(/c/:id)과 그 카테고리의 메모(/memo/:id) 어디에 있든
 * 같은 대화창이 오른쪽에 붙어 있고, 페이지를 옮겨도 대화가 끊기지 않는다.
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { MessageCircle } from 'lucide-react'
import { db } from '../../db/db'
import { useCategoryChat } from '../../sync/chats'
import { useMediaQuery } from '../../lib/hooks'
import { cn } from '../../lib/utils'
import { Button } from '../ui'
import { ChatPanel } from './ChatPanel'
import type { Peer } from './presence'

const CHAT_OPEN_KEY = 'ma:chatOpen'

interface SharedChatCtx {
  /** 지금 페이지가 대화가 있는 공유 페이지인지 */
  available: boolean
  open: boolean
  unread: number
  setOpen: (v: boolean) => void
  setPeers: (peers: Peer[]) => void
}
const Ctx = createContext<SharedChatCtx | null>(null)

export const useSharedChat = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('SharedChatProvider missing')
  return c
}

/** 페이지가 계산한 접속자 목록을 대화창의 접속 표시로 넘긴다 */
export function useSharePeers(peers: Peer[]) {
  const { setPeers } = useSharedChat()
  const key = peers.map((p) => p.uid).sort().join(',')
  useEffect(() => {
    setPeers(peers)
    // 접속자 구성이 바뀔 때만 갱신 (커서 이동마다 다시 그리지 않도록)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  useEffect(() => () => setPeers([]), [setPeers])
}

/** 현재 주소에서 대화 대상 카테고리 id를 찾는다 */
function useRouteCategoryId() {
  const { pathname } = useLocation()
  const catId = matchPath('/c/:id', pathname)?.params.id
  const memoId = matchPath('/memo/:id', pathname)?.params.id
  const memoCat = useLiveQuery(
    async () => (memoId ? ((await db.memos.get(memoId))?.categoryId ?? null) : null),
    [memoId],
  )
  return catId ?? memoCat ?? null
}

export function SharedChatProvider({ children }: { children: React.ReactNode }) {
  const categoryId = useRouteCategoryId()
  const access = useLiveQuery(
    async () => (categoryId ? ((await db.access.get(categoryId)) ?? null) : null),
    [categoryId],
  )
  const isShared = !!categoryId && !!access && (access.role !== 'owner' || access.members.length > 0)
  const [peers, setPeersState] = useState<Peer[]>([])
  const setPeers = useRef((p: Peer[]) => setPeersState(p)).current

  // 넓은 화면에서는 기본으로 열어 두고 마지막 선택을 기억한다
  const wide = useMediaQuery('(min-width: 1280px)')
  const [pref, setPref] = useState<boolean | null>(() => {
    try {
      const v = localStorage.getItem(CHAT_OPEN_KEY)
      return v === null ? null : v === '1'
    } catch {
      return null
    }
  })
  // 좁은 화면에서는 본문을 가리므로 저장된 선택과 관계없이 닫힌 채로 시작
  const [drawerOpen, setDrawerOpen] = useState(false)
  const open = isShared && (wide ? (pref ?? true) : drawerOpen)

  const [unread, setUnread] = useState(0)
  const openRef = useRef(open)
  openRef.current = open
  const chat = useCategoryChat(categoryId ?? '', isShared, () => {
    if (!openRef.current) setUnread((n) => n + 1)
  })

  // 다른 페이지로 옮기면 읽지 않음 수와 모바일 서랍을 초기화
  useEffect(() => {
    setUnread(0)
    setDrawerOpen(false)
  }, [categoryId])

  const setOpen = (v: boolean) => {
    if (v) setUnread(0)
    if (!wide) {
      setDrawerOpen(v)
      return
    }
    setPref(v)
    try {
      localStorage.setItem(CHAT_OPEN_KEY, v ? '1' : '0')
    } catch {
      /* 저장 못 해도 동작에는 문제 없음 */
    }
  }

  const ctx: SharedChatCtx = { available: isShared, open, unread, setOpen, setPeers }

  return (
    <Ctx.Provider value={ctx}>
      <div className={cn(open && 'items-start xl:grid xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-6')}>
        <div className="min-w-0">{children}</div>
        {open && categoryId && (
          <>
            {/* 좁은 화면: 오른쪽에서 밀려 나오는 패널 */}
            <div className="fixed inset-0 z-40 bg-[#2f2b28]/25 xl:hidden" onClick={() => setOpen(false)} aria-hidden />
            <ChatPanel
              key={categoryId}
              chat={chat}
              peers={peers}
              onClose={() => setOpen(false)}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-[380px] rounded-none! xl:sticky xl:top-6 xl:z-auto xl:h-[calc(100dvh-120px)] xl:max-w-none xl:rounded-[var(--radius-card)]!"
            />
          </>
        )}
      </div>
    </Ctx.Provider>
  )
}

/** 페이지 상단에 두는 대화 열기/닫기 버튼 (읽지 않은 수 표시) */
export function ChatToggleButton({ className }: { className?: string }) {
  const { available, open, unread, setOpen } = useSharedChat()
  if (!available) return null
  return (
    <span className="relative">
      <Button
        size="sm"
        className={cn(open && 'border-accent/50 bg-accent-soft text-ink', className)}
        icon={<MessageCircle size={15} />}
        onClick={() => setOpen(!open)}
        aria-pressed={open}
      >
        대화
      </Button>
      {!open && unread > 0 && (
        <span className="pointer-events-none absolute -top-1.5 -right-1.5 min-w-[18px] rounded-full border-2 border-card bg-primary px-1 text-center text-[10.5px] leading-[14px] font-bold text-primary-ink" aria-label={`새 메시지 ${unread}개`}>
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </span>
  )
}
