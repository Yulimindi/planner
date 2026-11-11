import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Download, Info, LogOut, Palette, RotateCcw, Settings as SettingsIcon, Type, Upload, UserRound } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Avatar } from '../components/share/ShareModal'
import { updateSettings } from '../db/repo'
import { downloadBlob, exportBackup, importBackup, parseBackup, resetAllData, storageEstimate, type BackupFile, type BackupSummary } from '../db/backup'
import { useSettings } from '../lib/hooks'
import { Button, Input, Modal, PageHeader } from '../components/ui'
import { useFeedback } from '../components/ui/Feedback'
import { cn, todayISO } from '../lib/utils'
import type { ThemeName } from '../db/types'

const THEMES: { id: ThemeName; name: string; desc: string; swatch: string[] }[] = [
  { id: 'ivory', name: 'Soft Ivory', desc: '기본 · 따뜻한 아이보리', swatch: ['#FFFEFC', '#FAF7F2', '#F8EDEB', '#EAE6F2'] },
  { id: 'mist', name: 'Morning Mist', desc: '차분한 블루 그레이', swatch: ['#FDFDFE', '#F5F7F9', '#EAF0F4', '#E4ECE2'] },
  { id: 'cocoa', name: 'Night Cocoa', desc: '눈이 편한 어두운 테마', swatch: ['#262321', '#221F1D', '#42363A', '#3D3834'] },
]

function Card({ icon, title, desc, children, wide }: { icon: ReactNode; title: string; desc?: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={cn('card p-6 sm:p-7', wide && 'lg:col-span-2')}>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">{icon}</span>
        <div>
          <h2 className="t-section">{title}</h2>
          {desc && <p className="text-[13px] text-muted">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

const fmtBytes = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

export default function SettingsPage() {
  const settings = useSettings()
  const { user, logout } = useAuth()
  const { confirm, run, toast } = useFeedback()
  const [name, setName] = useState(settings.appName)
  const [pending, setPending] = useState<{ backup: BackupFile; summary: BackupSummary; fileName: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [usage, setUsage] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => setName(settings.appName), [settings.appName])
  useEffect(() => {
    storageEstimate().then((e) => e && setUsage(`${fmtBytes(e.usage)} 사용 중`))
  }, [pending, busy])

  const saveName = () => {
    const v = name.trim()
    if (!v) {
      setName(settings.appName)
      toast('앱 이름은 비워둘 수 없어요.', 'error')
      return
    }
    if (v !== settings.appName) run(() => updateSettings({ appName: v.slice(0, 30) }), '앱 이름을 변경했어요.')
  }

  const doExport = async () => {
    setBusy(true)
    await run(async () => downloadBlob(await exportBackup(), `my-archive-backup-${todayISO()}.json`), '백업 파일을 내보냈어요.')
    setBusy(false)
  }

  const onPick = async (file: File | undefined) => {
    if (!file) return
    const parsed = await run(() => parseBackup(file))
    if (parsed) setPending({ ...parsed, fileName: file.name })
  }

  const doImport = async (mode: 'replace' | 'merge') => {
    if (!pending) return
    if (mode === 'replace') {
      const ok = await confirm({
        title: '현재 데이터를 모두 덮어쓸까요?',
        message: '계정에 저장된 내 카테고리, 메모, 표, 이미지가 모두 삭제되고 백업 파일의 내용으로 바뀌어요. 내가 공유한 페이지도 상대방에게서 사라져요. 되돌릴 수 없으니 필요하다면 먼저 현재 데이터를 내보내 두세요.',
        confirmText: '덮어쓰기',
        danger: true,
      })
      if (!ok) return
    }
    setBusy(true)
    const done = await run(async () => {
      await importBackup(pending.backup, mode)
      return true
    }, '백업 데이터를 복원했어요.')
    setBusy(false)
    if (done) setPending(null)
  }

  const doReset = async () => {
    const ok = await confirm({
      title: '모든 데이터를 초기화할까요?',
      message: '내 모든 카테고리, 메모, 표, 체크리스트, 이미지, 설정이 계정에서 삭제되고 처음 상태(기본 예시 카테고리)로 돌아가요. 내가 공유한 페이지도 상대방에게서 사라져요. 되돌릴 수 없으니 필요하면 먼저 백업해 주세요.',
      confirmText: '전체 초기화',
      danger: true,
    })
    if (!ok) return
    await run(() => resetAllData(), '데이터를 초기화했어요.')
  }

  return (
    <div>
      <PageHeader
        eyebrow={<><SettingsIcon size={17} strokeWidth={1.6} /> 계정 · 화면 · 데이터</>}
        title="Settings"
        description="앱 이름, 테마, 데이터 백업과 복원을 관리해요."
      />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card icon={<UserRound size={19} strokeWidth={1.6} />} title="계정" desc="기록은 계정에 저장되어 다른 기기에서 로그인해도 그대로 보여요.">
          {user && (
            <div className="flex flex-wrap items-center gap-3">
              <Avatar uid={user.id} name={user.username} size={40} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{user.username}</p>
                <p className="text-[12px] text-muted">다른 사람이 이 아이디로 페이지를 공유할 수 있어요.</p>
              </div>
              <Button icon={<LogOut size={16} />} onClick={async () => {
                const ok = await confirm({ title: '로그아웃할까요?', message: '이 브라우저에 저장된 캐시가 지워져요. 기록은 계정에 남아 있어요.', confirmText: '로그아웃' })
                if (ok) await logout()
              }}>로그아웃</Button>
            </div>
          )}
        </Card>

        <Card icon={<Type size={19} strokeWidth={1.6} />} title="앱 이름" desc="사이드바와 홈 화면, 브라우저 탭에 표시돼요.">
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} maxLength={30} />
            <Button onClick={() => { setName('My Archive'); run(() => updateSettings({ appName: 'My Archive' })) }}>기본값</Button>
          </div>
        </Card>

        <Card icon={<Palette size={19} strokeWidth={1.6} />} title="테마" desc="상단의 해/달 버튼으로도 밝은·어두운 테마를 바로 바꿀 수 있어요." wide>
          <div className="grid gap-2 sm:grid-cols-3">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => run(() => updateSettings({ theme: t.id }))}
                className={cn('rounded-[var(--radius-card)] border p-3 text-left transition', settings.theme === t.id ? 'border-accent/60 ring-2 ring-accent-soft' : 'border-line hover:bg-hover')}
              >
                <div className="mb-2 flex overflow-hidden rounded-lg border border-line">
                  {t.swatch.map((c) => <span key={c} className="h-8 flex-1" style={{ background: c }} />)}
                </div>
                <p className="text-[14px] font-medium">{t.name}</p>
                <p className="text-[12px] text-muted">{t.desc}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card icon={<Download size={19} strokeWidth={1.6} />} title="데이터 백업 · 복원" desc="기록은 계정(서버)에 저장돼요. 따로 보관하고 싶다면 JSON으로 내보내세요. 공유받은 페이지는 백업에 포함되지 않아요.">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<Download size={16} />} onClick={doExport} disabled={busy}>JSON 내보내기</Button>
            <Button icon={<Upload size={16} />} onClick={() => fileRef.current?.click()} disabled={busy}>JSON 가져오기</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          {usage && <p className="mt-3 text-[12px] text-muted">브라우저 저장소: {usage}</p>}
        </Card>

        <Card icon={<RotateCcw size={19} strokeWidth={1.6} />} title="전체 데이터 초기화" desc="내 카테고리·메모를 모두 지우고 처음 상태로 되돌려요. 공유받은 페이지는 그대로예요.">
          <Button variant="danger" onClick={doReset}>전체 초기화</Button>
        </Card>

        <Card icon={<Info size={19} strokeWidth={1.6} />} title="앱 정보" wide>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[13px]">
            <dt className="text-muted">이름</dt><dd>My Archive</dd>
            <dt className="text-muted">버전</dt><dd>0.2.0</dd>
            <dt className="text-muted">저장 방식</dt><dd>계정 서버(SQLite)에 저장, 브라우저(IndexedDB)는 빠른 표시와 오프라인용 캐시</dd>
            <dt className="text-muted">공유</dt><dd>카테고리를 아이디로 초대해 편집/보기 권한으로 공유하고, 같은 페이지에서는 서로의 마우스가 실시간으로 보여요.</dd>
          </dl>
        </Card>
      </div>

      <Modal
        open={!!pending}
        onClose={() => !busy && setPending(null)}
        title="백업 가져오기"
        footer={
          <>
            <Button onClick={() => setPending(null)} disabled={busy}>취소</Button>
            <Button onClick={() => doImport('merge')} disabled={busy}>기존 데이터에 병합</Button>
            <Button variant="danger" onClick={() => doImport('replace')} disabled={busy}>전체 덮어쓰기</Button>
          </>
        }
      >
        {pending && (
          <div className="space-y-4 text-[14px]">
            <div className="rounded-[var(--radius-ctl)] bg-side/60 p-4">
              <p className="mb-1 font-medium">{pending.fileName}</p>
              <p className="text-[12px] text-muted">내보낸 날짜: {new Date(pending.backup.exportedAt).toLocaleString('ko-KR')}</p>
              <p className="mt-2 text-[13px] text-muted">
                카테고리 {pending.summary.categories} · 메모 {pending.summary.memos} · 표 행 {pending.summary.rows} · 체크리스트 {pending.summary.checklist} · 이미지 {pending.summary.images}
              </p>
            </div>
            <ul className="space-y-2 text-[13px] text-muted">
              <li><b className="text-ink">병합</b>: 현재 데이터를 유지하고 백업 내용을 추가해요. 같은 항목(같은 ID)은 백업 내용으로 덮어써요.</li>
              <li><b className="text-danger">전체 덮어쓰기</b>: 현재 데이터를 모두 지우고 백업 파일로 교체해요.</li>
            </ul>
          </div>
        )}
      </Modal>
    </div>
  )
}
