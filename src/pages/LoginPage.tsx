import { useState } from 'react'
import { LogIn, UserPlus } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Button, Input, Label, Segmented } from '../components/ui'

type Mode = 'login' | 'signup'

export default function LoginPage({ notice }: { notice?: string }) {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password) {
      setError('아이디와 비밀번호를 입력해 주세요.')
      return
    }
    if (mode === 'signup') {
      if (!/^[a-zA-Z0-9_가-힣]{3,20}$/.test(username.trim())) {
        setError('아이디는 3~20자의 한글, 영문, 숫자, 밑줄(_)만 사용할 수 있어요.')
        return
      }
      if (password.length < 6) {
        setError('비밀번호는 6자 이상이어야 해요.')
        return
      }
      if (password !== confirm) {
        setError('비밀번호 확인이 일치하지 않아요.')
        return
      }
    }
    setBusy(true)
    try {
      if (mode === 'login') await login(username.trim(), password)
      else await signup(username.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : '잠시 후 다시 시도해 주세요.')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-app px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent-soft">
            <img src="/favicon.svg" alt="" className="size-10" />
          </div>
          <h1 className="text-[26px] font-semibold tracking-tight">My Archive</h1>
          <p className="mt-1 text-[14px] text-muted">생각과 계획을 차곡차곡 모아두는 나만의 아카이브</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <div className="flex justify-center">
            <Segmented<Mode>
              value={mode}
              onChange={(m) => { setMode(m); setError('') }}
              options={[{ value: 'login', label: '로그인' }, { value: 'signup', label: '회원가입' }]}
            />
          </div>
          {notice && mode === 'login' && <p className="rounded-xl bg-side px-3 py-2 text-[13px] text-muted">{notice}</p>}
          <div>
            <Label>아이디</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus maxLength={20} />
          </div>
          <div>
            <Label hint={mode === 'signup' ? '6자 이상' : undefined}>비밀번호</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} maxLength={100} />
          </div>
          {mode === 'signup' && (
            <div>
              <Label>비밀번호 확인</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" maxLength={100} />
            </div>
          )}
          {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" disabled={busy} icon={mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}>
            {busy ? '잠시만요…' : mode === 'login' ? '로그인' : '가입하고 시작하기'}
          </Button>
          {mode === 'signup' && (
            <p className="text-center text-[12px] text-muted">가입하면 기본 예시 카테고리가 만들어져요. 다른 사람은 내 아이디로 페이지를 공유할 수 있어요.</p>
          )}
        </form>
      </div>
    </div>
  )
}
