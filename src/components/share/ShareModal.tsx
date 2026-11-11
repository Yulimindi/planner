import { createContext, useContext, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useFriends } from '../../sync/friends'
import { Avatar, UserLabel } from '../user/UserBits'
import { db } from '../../db/db'
import type { Category, Role } from '../../db/types'
import { api } from '../../sync/api'
import { fullSync } from '../../sync/engine'
import { Button, IconButton, Input, Label, Modal, Select } from '../ui'
import { useFeedback } from '../ui/Feedback'

/** 현재 페이지에서 편집 가능한지 (보기 전용 공유면 false) */
export const CanEditContext = createContext(true)
export const useCanEdit = () => useContext(CanEditContext)

export const ROLE_LABEL: Record<Role, string> = { owner: '소유자', edit: '편집 가능', view: '보기 전용' }

export function ShareModal({ open, onClose, category }: { open: boolean; onClose: () => void; category: Category }) {
  const access = useLiveQuery(() => db.access.get(category.id), [category.id])
  const { run, confirm } = useFeedback()
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<'edit' | 'view'>('edit')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // 서버 응답 후 로컬 권한 정보를 최신으로 맞춘다
  const refresh = () => fullSync().catch(() => undefined)

  const { friends } = useFriends()

  const inviteName = async (name: string) => {
    if (!name.trim()) return
    setBusy(true)
    setError('')
    try {
      await api(`/api/shares/${category.id}`, { body: { username: name.trim(), role } })
      await refresh()
      setUsername('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '공유하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  const invite = (e: React.FormEvent) => {
    e.preventDefault()
    void inviteName(username)
  }

  const changeRole = (userId: string, r: 'edit' | 'view') =>
    run(async () => {
      await api(`/api/shares/${category.id}/${userId}`, { method: 'PATCH', body: { role: r } })
      await refresh()
    })

  const remove = async (userId: string, name: string) => {
    const ok = await confirm({
      title: `${name}님의 공유를 해제할까요?`,
      message: '해제하면 이 사용자는 더 이상 이 페이지를 볼 수 없어요.',
      confirmText: '공유 해제',
      danger: true,
    })
    if (ok) await run(async () => {
      await api(`/api/shares/${category.id}/${userId}`, { method: 'DELETE' })
      await refresh()
    }, '공유를 해제했어요.')
  }

  const members = access?.members ?? []
  // 아직 이 페이지에 초대하지 않은 친구
  const invitable = friends.filter((f) => !members.some((m) => m.userId === f.userId))

  return (
    <Modal open={open} onClose={onClose} title={`"${category.name}" 공유`}>
      <form onSubmit={invite} className="mb-5">
        <Label>아이디로 초대</Label>
        <div className="flex flex-wrap gap-2">
          <Input value={username} onChange={(e) => { setUsername(e.target.value); setError('') }} placeholder="상대방 아이디" className="min-w-40 flex-1" maxLength={20} />
          <Select value={role} onChange={(e) => setRole(e.target.value as 'edit' | 'view')} className="w-32">
            <option value="edit">편집 가능</option>
            <option value="view">보기 전용</option>
          </Select>
          <Button type="submit" variant="primary" icon={<UserPlus size={16} />} disabled={busy || !username.trim()}>초대</Button>
        </div>
        {error && <p className="mt-1.5 text-[12px] text-danger">{error}</p>}
        <p className="mt-1.5 text-[12px] text-muted">초대받은 사람의 사이드바 ‘공유받은 페이지’에 바로 나타나고, 같은 페이지를 보면 서로의 마우스가 보여요.</p>
      </form>

      <div className="mb-6">
        <Label hint={friends.length ? `위에서 고른 권한(${role === 'edit' ? '편집 가능' : '보기 전용'})으로 초대돼요` : undefined}>친구 목록에서 초대</Label>
        {friends.length === 0 ? (
          <p className="rounded-[var(--radius-ctl)] bg-side px-3.5 py-3 text-[13px] text-muted">
            아직 친구가 없어요. <Link to="/friends" onClick={onClose} className="font-medium text-ink-2 underline underline-offset-2">Friends</Link>에서 친구를 추가하면 여기서 바로 고를 수 있어요.
          </p>
        ) : invitable.length === 0 ? (
          <p className="rounded-[var(--radius-ctl)] bg-side px-3.5 py-3 text-[13px] text-muted">모든 친구가 이미 함께하고 있어요.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {invitable.map((f) => (
              <button
                key={f.userId}
                type="button"
                disabled={busy}
                onClick={() => void inviteName(f.username)}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-card pr-3.5 pl-1.5 text-[13.5px] font-medium text-ink-2 shadow-soft transition hover:border-accent/60 hover:text-ink disabled:opacity-50"
              >
                <Avatar uid={f.userId} name={f.username} size={28} />
                <UserLabel uid={f.userId} fallback={f.username} />
                <Plus size={15} className="text-muted" />
              </button>
            ))}
          </div>
        )}
      </div>

      <Label>함께하는 사람</Label>
      <ul className="divide-y divide-line rounded-[var(--radius-ctl)] border border-line">
        <li className="flex items-center gap-3 px-3 py-2.5">
          <Avatar uid={access?.ownerId ?? ''} name={access?.ownerName ?? '나'} />
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-[14px]">
            {access ? <UserLabel uid={access.ownerId} fallback={access.ownerName} /> : '나'} <span className="text-muted">(나)</span>
          </span>
          <span className="text-[13px] text-muted">소유자</span>
        </li>
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 px-3 py-2">
            <Avatar uid={m.userId} name={m.username} />
            <UserLabel uid={m.userId} fallback={m.username} className="flex-1 text-[14px]" />
            <Select value={m.role} onChange={(e) => changeRole(m.userId, e.target.value as 'edit' | 'view')} className="h-8 w-28 text-[13px]" aria-label="권한">
              <option value="edit">편집 가능</option>
              <option value="view">보기 전용</option>
            </Select>
            <IconButton label="공유 해제" className="hover:text-danger" onClick={() => remove(m.userId, m.username)}><Trash2 size={15} /></IconButton>
          </li>
        ))}
        {!members.length && <li className="px-3 py-3 text-[13px] text-muted">아직 공유한 사람이 없어요.</li>}
      </ul>
    </Modal>
  )
}

export { Avatar } from '../user/UserBits'
