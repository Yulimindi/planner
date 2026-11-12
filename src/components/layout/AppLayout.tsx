import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Archive, FolderOpen, Home, LibraryBig, LogOut, Mail, Menu, Moon, PanelLeftClose, PanelLeftOpen, PenLine, Plus, Search, Settings,
  Star, Sun, Users, X,
} from 'lucide-react'
import { useAccessMap, useCategoryCounts, useSettings, useSplitCategories } from '../../lib/hooks'
import { useAuth } from '../../auth/AuthProvider'
import { syncState } from '../../sync/engine'
import { Avatar, UserName } from '../user/UserBits'
import { useProfileSync } from '../../sync/profiles'
import { PAGE_CONTAINER_ID } from '../share/presence'
import { SharedChatProvider } from '../share/SharedChat'
import { useFriends, useFriendsSync } from '../../sync/friends'
import { useMessagesSync, useUnreadMessages } from '../../sync/messages'
import { MiniMailboxHost, toggleMiniMailbox, useMiniMailboxOpen } from '../messages/MiniMailboxHost'
import { useFeedback } from '../ui/Feedback'
import { updateSettings } from '../../db/repo'
import { cn } from '../../lib/utils'
import { CategoryFormModal, CategoryIconBadge } from '../category/CategoryForm'
import { QuickMemoModal } from '../memo/QuickMemoComposer'
import { IconButton } from '../ui'
import type { Category } from '../../db/types'

interface UICtx {
  openCategoryForm: (cat?: Category) => void
  openQuickMemo: () => void
}
const UIContext = createContext<UICtx | null>(null)
export const useUI = () => {
  const c = useContext(UIContext)
  if (!c) throw new Error('UIContext missing')
  return c
}

const MENU = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/quick', label: 'Quick Memo', icon: PenLine },
  { to: '/favorites', label: 'Favorites', icon: Star },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/messages', label: 'Messages', icon: Mail },
  { to: '/categories', label: 'Categories', icon: FolderOpen },
  { to: '/archive', label: 'Archive', icon: Archive },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function Sidebar({ collapsed, onToggle, onClose, mobile }: {
  collapsed: boolean
  onToggle?: () => void
  onClose?: () => void
  mobile?: boolean
}) {
  const settings = useSettings()
  const { owned, shared } = useSplitCategories()
  const access = useAccessMap()
  const counts = useCategoryCounts()
  const { openCategoryForm } = useUI()
  const { incoming } = useFriends()
  const unreadMessages = useUnreadMessages()
  const badges: Record<string, { n: number; label: string }> = {
    '/friends': { n: incoming.length, label: `받은 친구 요청 ${incoming.length}개` },
    '/messages': { n: unreadMessages, label: `안 읽은 쪽지 ${unreadMessages}통` },
  }
  const mini = collapsed && !mobile

  const itemCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex h-11 items-center gap-3.5 rounded-[var(--radius-ctl)] px-3.5 text-[15px] transition',
      mini && 'justify-center px-0',
      isActive ? 'bg-accent-soft font-semibold text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink',
    )

  return (
    <aside className={cn('flex h-full flex-col bg-side', mini ? 'w-[76px]' : 'w-[268px]')}>
      <div className={cn('flex h-[84px] items-center gap-2.5 pr-5 pl-7', mini && 'flex-col justify-center gap-1 px-0')}>
        <NavLink to="/" className="flex min-w-0 flex-1 items-center gap-3" title={settings.appName}>
          <span className="flex size-8 shrink-0 items-center justify-center text-accent">
            <LibraryBig size={26} strokeWidth={1.6} />
          </span>
          {!mini && <span className="truncate text-[19px] font-semibold tracking-[-0.02em] text-ink">{settings.appName}</span>}
        </NavLink>
        {mobile ? (
          <IconButton label="메뉴 닫기" onClick={onClose}><X size={18} /></IconButton>
        ) : (
          <IconButton label={collapsed ? '사이드바 펼치기' : '사이드바 접기'} onClick={onToggle}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </IconButton>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-5 pt-1 pb-4">
        <ul className="space-y-1.5">
          {MENU.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={(s) => cn(itemCls(s), 'relative')} title={mini ? label : undefined}>
                <Icon size={20} strokeWidth={1.6} />
                {!mini && <span className="flex-1">{label}</span>}
                {!!badges[to]?.n && (
                  <span
                    className={cn('min-w-[18px] rounded-full bg-primary px-1.5 text-center text-[11.5px] leading-[18px] font-semibold text-primary-ink', mini && 'absolute top-1 right-3')}
                    aria-label={badges[to].label}
                  >
                    {badges[to].n > 99 ? '99+' : badges[to].n}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="mx-2 my-6 border-t border-line-strong/70" />
        <SectionTitle
          mini={mini}
          action={
            <IconButton label="새 카테고리" className="size-[26px] rounded-full! border border-line-strong bg-card/60" onClick={() => openCategoryForm()}>
              <Plus size={14} strokeWidth={2} />
            </IconButton>
          }
        >
          My Categories
        </SectionTitle>
        <ul className="space-y-0.5">
          {owned?.map((c) => (
            <li key={c.id}>
              <CategoryLink cat={c} mini={mini} count={counts[c.id] ?? 0} />
            </li>
          ))}
          {owned?.length === 0 && !mini && (
            <li>
              <button type="button" onClick={() => openCategoryForm()} className="w-full rounded-lg px-3 py-2 text-left text-[13px] text-muted hover:bg-hover hover:text-ink">
                + 첫 카테고리 만들기
              </button>
            </li>
          )}
        </ul>

        {!!shared?.length && (
          <>
            <SectionTitle mini={mini} className="mt-6">Shared with me</SectionTitle>
            <ul className="space-y-0.5">
              {shared.map((c) => (
                <li key={c.id}>
                  <CategoryLink cat={c} mini={mini} count={counts[c.id] ?? 0} sub={access.get(c.id)?.ownerName} subUid={access.get(c.id)?.ownerId} />
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>

      <div className="px-5 pt-2 pb-6">
        <AccountBar mini={mini} />
      </div>
    </aside>
  )
}

function SectionTitle({ mini, children, action, className }: { mini: boolean; children: string; action?: React.ReactNode; className?: string }) {
  if (mini) return <div className={cn('mx-3 my-4 border-t border-line', className)} />
  return (
    <div className={cn('mb-3 flex items-center justify-between pr-1.5 pl-3', className)}>
      <span className="t-label text-[12px]">{children}</span>
      {action}
    </div>
  )
}

function CategoryLink({ cat, mini, count, sub, subUid }: { cat: Category; mini: boolean; count: number; sub?: string; subUid?: string }) {
  return (
    <NavLink
      to={`/c/${cat.id}`}
      className={({ isActive }) =>
        cn(
          'flex min-h-[42px] items-center gap-3 rounded-[var(--radius-ctl)] px-2.5 py-1.5 text-[14.5px] transition',
          mini && 'justify-center px-0',
          isActive ? 'bg-accent-soft font-semibold text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink',
        )
      }
      title={mini ? cat.name : undefined}
    >
      <CategoryIconBadge cat={cat} size={28} />
      {!mini && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{cat.name}</span>
            {sub && <span className="flex items-center gap-1 truncate text-[11px] text-muted/80"><Users size={11} /> {subUid ? <UserName uid={subUid} fallback={sub} /> : sub}</span>}
          </span>
          <span className="pr-1 text-[13px] font-normal text-muted tabular-nums">{count}</span>
        </>
      )}
    </NavLink>
  )
}

const CONN_LABEL = { online: '실시간 연결됨', connecting: '연결 중…', offline: '오프라인 · 다시 연결되면 저장돼요' } as const

/** 사이드바 하단: 내 계정, 연결 상태, 로그아웃 */
function AccountBar({ mini }: { mini: boolean }) {
  const { user, logout } = useAuth()
  const snap = useSyncExternalStore(syncState.subscribe, syncState.get)
  const [conn, pending] = snap.split('|') as [keyof typeof CONN_LABEL, string]
  if (!user) return null
  const dot = conn === 'online' ? 'bg-[#8FB08A]' : conn === 'connecting' ? 'bg-[#D9C27E]' : 'bg-danger'
  const label = CONN_LABEL[conn] + (Number(pending) ? ` (보낼 변경 ${pending}개)` : '')
  return (
    <div className={cn('flex items-center gap-3 rounded-[var(--radius-card)] bg-[color-mix(in_srgb,var(--line)_45%,var(--side-bg))] px-3.5 py-3', mini && 'flex-col bg-transparent p-0')}>
      <span className="relative" title={label}>
        <Avatar uid={user.id} name={user.username} size={34} />
        <span className={cn('absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-side', dot)} />
      </span>
      {!mini && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-ink"><UserName uid={user.id} fallback={user.username} /></p>
          <p className="truncate text-[11.5px] text-muted">{label}</p>
        </div>
      )}
      <IconButton label="로그아웃" onClick={() => void logout()}><LogOut size={16} /></IconButton>
    </div>
  )
}

/** 홈 오른쪽 위의 은은한 곡선 면 (참고 디자인의 배경) */
function HomeBackdrop() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute top-0 right-0 hidden h-[560px] w-[760px] max-w-full md:block"
      viewBox="0 0 760 560"
      preserveAspectRatio="xMaxYMin slice"
    >
      <defs>
        <linearGradient id="hb-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--glow)" stopOpacity="0.75" />
          <stop offset="1" stopColor="var(--glow)" stopOpacity="0.25" />
        </linearGradient>
        <linearGradient id="hb-b" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--glow)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--glow)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M760 0H380c-18 70 30 120 110 128 92 9 150 52 168 120 14 52 50 84 102 92V0Z" fill="url(#hb-a)" />
      <path d="M760 210c-60-6-118 18-140 74-26 66 8 150 80 196 22 14 42 22 60 26V210Z" fill="url(#hb-b)" />
    </svg>
  )
}

/** 상단의 미니 쪽지창 버튼 (안 읽은 쪽지 수 표시) */
function MiniMailboxButton() {
  const unread = useUnreadMessages()
  const open = useMiniMailboxOpen()
  return (
    <span className="relative">
      <IconButton
        label={open ? '미니 쪽지창 닫기' : '미니 쪽지창 열기'}
        title={open ? '미니 쪽지창 닫기' : '쪽지를 작은 창으로 띄워 보기'}
        className={cn('size-11 rounded-full! border border-line bg-card/90 text-ink-2 shadow-soft', open && 'border-accent/50 bg-accent-soft text-ink')}
        onClick={toggleMiniMailbox}
      >
        <Mail size={18} strokeWidth={1.6} />
      </IconButton>
      {unread > 0 && (
        <span className="pointer-events-none absolute -top-0.5 -right-0.5 min-w-[18px] rounded-full border-2 border-app bg-primary px-1 text-center text-[10.5px] leading-[14px] font-bold text-primary-ink">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </span>
  )
}

/** 데스크톱 상단: 전체 검색 + 테마 전환 */
function TopBar() {
  const settings = useSettings()
  const navigate = useNavigate()
  const location = useLocation()
  const [q, setQ] = useState('')
  const dark = settings.theme === 'cocoa'
  const onSearchPage = location.pathname === '/search'
  const onHome = location.pathname === '/'
  return (
    // 홈에서는 인사말 옆(오른쪽 위)에 겹쳐 두고, 다른 페이지에서는 제목 위에 한 줄로 둔다
    <div className={cn('hidden items-center justify-end gap-3 md:flex', onHome ? 'absolute top-8 right-10 z-10' : 'mb-5')}>
      {!onSearchPage && (
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            navigate(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search')
            setQ('')
          }}
          className="relative w-full max-w-[320px]"
        >
          <Search size={18} strokeWidth={1.7} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="모든 메모를 검색해보세요…"
            aria-label="전체 검색"
            className="field h-11 rounded-full! border-line bg-card/90 pl-11 text-[14px] shadow-soft"
          />
        </form>
      )}
      <MiniMailboxButton />
      <IconButton
        label={dark ? '밝은 테마로' : '어두운 테마로'}
        className="size-11 rounded-full! border border-line bg-card/90 text-ink-2 shadow-soft"
        onClick={() => updateSettings({ theme: dark ? 'ivory' : 'cocoa' })}
      >
        {dark ? <Moon size={19} strokeWidth={1.6} /> : <Sun size={19} strokeWidth={1.6} />}
      </IconButton>
    </div>
  )
}

export function AppLayout() {
  const settings = useSettings()
  const { toast } = useFeedback()
  // 친구 목록 동기화 + 요청/수락 알림
  useFriendsSync((e) => {
    if (e.event === 'request') toast(`${e.name}님이 친구 요청을 보냈어요.`)
    else if (e.event === 'accepted') toast(`${e.name}님과 친구가 되었어요.`)
  })
  // 닉네임·프로필 사진 변경 실시간 반영
  useProfileSync()
  // 안 읽은 쪽지 수 + 새 쪽지 알림
  useMessagesSync((e) => toast(`${e.name}님에게서 쪽지가 왔어요${e.subject ? ` · ${e.subject}` : ''}`))
  const [mobileOpen, setMobileOpen] = useState(false)
  const [catForm, setCatForm] = useState<{ open: boolean; cat?: Category }>({ open: false })
  const [quickOpen, setQuickOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setMobileOpen(false), [location.pathname])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    document.title = settings.appName
  }, [settings.theme, settings.appName])

  const ctx: UICtx = {
    openCategoryForm: (cat) => setCatForm({ open: true, cat }),
    openQuickMemo: () => setQuickOpen(true),
  }

  return (
    <UIContext.Provider value={ctx}>
      <div className="flex h-dvh overflow-hidden bg-app">
        {/* desktop sidebar */}
        <div className="hidden border-r border-line/80 md:block">
          <Sidebar collapsed={settings.sidebarCollapsed} onToggle={() => updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed })} />
        </div>

        {/* mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-[#2f2b28]/30" onClick={() => setMobileOpen(false)} />
            <div className="absolute inset-y-0 left-0 shadow-xl">
              <Sidebar collapsed={false} mobile onClose={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center gap-1 border-b border-line bg-app/90 px-3 backdrop-blur md:hidden">
            <IconButton label="메뉴 열기" onClick={() => setMobileOpen(true)}><Menu size={20} /></IconButton>
            <NavLink to="/" className="flex-1 truncate text-[16px] font-bold tracking-[-0.01em]">{settings.appName}</NavLink>
            <NavLink to="/search" aria-label="검색" className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-ink"><Search size={18} /></NavLink>
            <IconButton label="빠른 메모" onClick={() => setQuickOpen(true)}><PenLine size={18} /></IconButton>
          </header>
          <main className="relative min-w-0 flex-1 overflow-y-auto">
            {location.pathname === '/' ? (
              <HomeBackdrop />
            ) : (
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 right-0 h-[360px] w-[560px] max-w-full"
                style={{ background: 'radial-gradient(60% 55% at 90% 0%, var(--glow) 0%, transparent 70%)' }}
              />
            )}
            <div id={PAGE_CONTAINER_ID} className="relative mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-8 md:px-10 md:py-8 xl:pr-10 xl:pl-16">
              <TopBar />
              <SharedChatProvider>
                <Outlet />
              </SharedChatProvider>
            </div>
          </main>
        </div>
      </div>

      <CategoryFormModal open={catForm.open} category={catForm.cat} onClose={() => setCatForm({ open: false })} />
      <MiniMailboxHost />
      <QuickMemoModal open={quickOpen} onClose={() => setQuickOpen(false)} />
    </UIContext.Provider>
  )
}

