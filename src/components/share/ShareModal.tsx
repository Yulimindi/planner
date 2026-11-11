import { createContext, useContext, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2, UserPlus } from 'lucide-react'
import { db } from '../../db/db'
import type { Category, Role } from '../../db/types'
import { api } from '../../sync/api'
import { fullSync } from '../../sync/engine'
import { Button, IconButton, Input, Label, Modal, Select } from '../ui'
import { useFeedback } from '../ui/Feedback'
import { peerColor } from './presence'

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

  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return
    setBusy(true)
    setError('')
    try {
      await api(`/api/shares/${category.id}`, { body: { username: username.trim(), role } })
      await refresh()
      setUsername('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '공유하지 못했어요.')
    } finally {
      setBusy(false)
    }
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

      <Label>함께하는 사람</Label>
      <ul className="divide-y divide-line rounded-xl border border-line">
        <li className="flex items-center gap-3 px-3 py-2.5">
          <Avatar uid={access?.ownerId ?? ''} name={access?.ownerName ?? '나'} />
          <span className="flex-1 text-[14px]">{access?.ownerName ?? '나'} <span className="text-muted">(나)</span></span>
          <span className="text-[13px] text-muted">소유자</span>
        </li>
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 px-3 py-2">
            <Avatar uid={m.userId} name={m.username} />
            <span className="min-w-0 flex-1 truncate text-[14px]">{m.username}</span>
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

export function Avatar({ uid, name, size = 28 }: { uid: string; name: string; size?: number }) {
  const c = peerColor(uid)
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full text-[12px] font-semibold" style={{ width: size, height: size, background: c.bg, color: c.fg }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}
