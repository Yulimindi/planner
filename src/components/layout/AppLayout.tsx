import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Archive, FolderOpen, Home, LogOut, Menu, PanelLeftClose, PanelLeftOpen, PenLine, Plus, Search, Settings, Star, Users, X,
} from 'lucide-react'
import { useAccessMap, useCategoryCounts, useSettings, useSplitCategories } from '../../lib/hooks'
import { useAuth } from '../../auth/AuthProvider'
import { syncState } from '../../sync/engine'
import { Avatar } from '../share/ShareModal'
import { PAGE_CONTAINER_ID } from '../share/presence'
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
  const mini = collapsed && !mobile

  const itemCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] transition',
      mini && 'justify-center px-0',
      isActive ? 'bg-card text-ink shadow-soft' : 'text-muted hover:bg-hover/70 hover:text-ink',
    )

  return (
    <aside className={cn('flex h-full flex-col bg-side', mini ? 'w-[68px]' : 'w-64')}>
      <div className={cn('flex items-center gap-2 px-4 pt-5 pb-4', mini && 'justify-center px-0')}>
        {!mini && (
          <NavLink to="/" className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight text-ink">
            {settings.appName}
          </NavLink>
        )}
        {mobile ? (
          <IconButton label="메뉴 닫기" onClick={onClose}><X size={18} /></IconButton>
        ) : (
          <IconButton label={collapsed ? '사이드바 펼치기' : '사이드바 접기'} onClick={onToggle}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </IconButton>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        <ul className="space-y-0.5">
          {MENU.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={itemCls} title={mini ? label : undefined}>
                <Icon size={18} strokeWidth={1.8} />
                {!mini && <span>{label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>

        <SectionTitle mini={mini}>카테고리</SectionTitle>
        <ul className="space-y-0.5">
          {owned?.map((c) => (
            <li key={c.id}>
              <CategoryLink cat={c} mini={mini} count={counts[c.id] ?? 0} />
            </li>
          ))}
          {owned?.length === 0 && !mini && <li className="px-3 py-2 text-[13px] text-muted">아직 카테고리가 없어요.</li>}
        </ul>

        {!!shared?.length && (
          <>
            <SectionTitle mini={mini}>공유받은 페이지</SectionTitle>
            <ul className="space-y-0.5">
              {shared.map((c) => (
                <li key={c.id}>
                  <CategoryLink cat={c} mini={mini} count={counts[c.id] ?? 0} sub={access.get(c.id)?.ownerName} />
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>

      <div className="border-t border-line p-3">
        <button
          type="button"
          onClick={() => openCategoryForm()}
          title="새 카테고리"
          className={cn(
            'flex w-full items-center gap-2 rounded-xl border border-dashed border-muted/40 px-3 py-2 text-[14px] text-muted transition hover:border-muted hover:bg-hover/60 hover:text-ink',
            mini && 'justify-center px-0',
          )}
        >
          <Plus size={18} />
          {!mini && '새 카테고리'}
        </button>
        <AccountBar mini={mini} />
      </div>
    </aside>
  )
}

function SectionTitle({ mini, children }: { mini: boolean; children: string }) {
  if (mini) return <div className="mx-3 my-4 border-t border-line" />
  return <div className="mt-6 mb-2 px-3 text-[12px] font-medium tracking-wide text-muted/80">{children}</div>
}

function CategoryLink({ cat, mini, count, sub }: { cat: Category; mini: boolean; count: number; sub?: string }) {
  return (
    <NavLink
      to={`/c/${cat.id}`}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[14px] transition',
          mini && 'justify-center px-0',
          isActive ? 'bg-card text-ink shadow-soft' : 'text-muted hover:bg-hover/70 hover:text-ink',
        )
      }
      title={mini ? cat.name : undefined}
    >
      <CategoryIconBadge cat={cat} size={28} />
      {!mini && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{cat.name}</span>
            {sub && <span className="flex items-center gap-1 truncate text-[11px] text-muted/80"><Users size={11} /> {sub}</span>}
          </span>
          <span className="text-[12px] text-muted/70">{count}</span>
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
    <div className={cn('mt-2 flex items-center gap-2 px-1', mini && 'flex-col px-0')}>
      <span className="relative" title={label}>
        <Avatar uid={user.id} name={user.username} size={30} />
        <span className={cn('absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-side', dot)} />
      </span>
      {!mini && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink">{user.username}</p>
          <p className="truncate text-[11px] text-muted">{label}</p>
        </div>
      )}
      <IconButton label="로그아웃" onClick={() => void logout()}><LogOut size={16} /></IconButton>
    </div>
  )
}

export function AppLayout() {
  const settings = useSettings()
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
        <div className="hidden border-r border-line md:block">
          <Sidebar collapsed={settings.sidebarCollapsed} onToggle={() => updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed })} />
        </div>

        {/* mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-[#4F4B47]/25" onClick={() => setMobileOpen(false)} />
            <div className="absolute inset-y-0 left-0 shadow-xl">
              <Sidebar collapsed={false} mobile onClose={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-2 border-b border-line bg-app/90 px-3 py-2 backdrop-blur md:hidden">
            <IconButton label="메뉴 열기" onClick={() => setMobileOpen(true)}><Menu size={20} /></IconButton>
            <NavLink to="/" className="flex-1 truncate font-semibold">{settings.appName}</NavLink>
            <IconButton label="빠른 메모" onClick={() => setQuickOpen(true)}><PenLine size={18} /></IconButton>
          </header>
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div id={PAGE_CONTAINER_ID} className="relative mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      <CategoryFormModal open={catForm.open} category={catForm.cat} onClose={() => setCatForm({ open: false })} />
      <QuickMemoModal open={quickOpen} onClose={() => setQuickOpen(false)} />
    </UIContext.Provider>
  )
}

