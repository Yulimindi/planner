import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { FeedbackProvider } from './components/ui/Feedback'
import { db } from './db/db'
import HomePage from './pages/HomePage'
import QuickMemoPage from './pages/QuickMemoPage'
import FavoritesPage from './pages/FavoritesPage'
import SearchPage from './pages/SearchPage'
import CategoriesPage from './pages/CategoriesPage'
import ArchivePage from './pages/ArchivePage'
import SettingsPage from './pages/SettingsPage'
import CategoryPage from './pages/CategoryPage'
import MemoPage from './pages/MemoPage'
import NotFoundPage from './pages/NotFoundPage'
import LoginPage from './pages/LoginPage'
import FriendsPage from './pages/FriendsPage'
import MessagesPage from './pages/MessagesPage'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { Button } from './components/ui'

export default function App() {
  const [dbError, setDbError] = useState<string | null>(null)

  useEffect(() => {
    db.open().catch((e: unknown) => {
      console.error(e)
      setDbError(e instanceof Error ? e.message : String(e))
    })
  }, [])

  if (dbError) {
    return (
      <div className="flex h-dvh items-center justify-center p-6">
        <div className="card max-w-md p-6 text-center">
          <h1 className="mb-2 text-lg font-semibold">저장소를 열 수 없어요</h1>
          <p className="text-[14px] text-muted">
            브라우저의 IndexedDB를 사용할 수 없습니다. 시크릿 모드이거나 저장소 권한이 차단되었는지 확인해 주세요.
          </p>
          <p className="mt-3 text-[12px] text-muted/80">{dbError}</p>
        </div>
      </div>
    )
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <FeedbackProvider>
          <AuthGate />
        </FeedbackProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}

function AuthGate() {
  const { state, retry } = useAuth()
  if (state.status === 'loading') {
    return <div className="flex h-dvh items-center justify-center text-[14px] text-muted">기록을 불러오는 중…</div>
  }
  if (state.status === 'error') {
    return (
      <div className="flex h-dvh items-center justify-center p-6">
        <div className="card max-w-md p-6 text-center">
          <h1 className="mb-2 text-lg font-semibold">서버에 연결할 수 없어요</h1>
          <p className="text-[14px] text-muted">{state.message}</p>
          <p className="mt-2 text-[12px] text-muted/80">서버(npm run dev)가 실행 중인지 확인해 주세요.</p>
          <Button className="mt-4" onClick={retry}>다시 시도</Button>
        </div>
      </div>
    )
  }
  if (state.status === 'anon') return <LoginPage notice={state.notice} />
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="quick" element={<QuickMemoPage />} />
        <Route path="favorites" element={<FavoritesPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="friends" element={<FriendsPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="archive" element={<ArchivePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="c/:id" element={<CategoryPage />} />
        <Route path="memo/:id" element={<MemoPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
