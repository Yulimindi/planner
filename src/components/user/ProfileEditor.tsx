/** 설정 > 프로필: 상대방에게 보이는 닉네임과 프로필 사진 */
import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { Button, Input, Label } from '../ui'
import { useFeedback } from '../ui/Feedback'
import { Avatar } from './UserBits'
import { deleteAvatar, saveNickname, uploadAvatar, useProfile } from '../../sync/profiles'
import type { AuthUser } from '../../sync/api'

const MAX_NICK = 20
const SIZE = 256

/** 가운데를 정사각형으로 잘라 256px WebP로 줄인다 (용량↓, 어디서나 동그랗게 보이도록) */
async function squareCrop(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const side = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  canvas.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE)
  bmp.close()
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.88))
  if (!blob) throw new Error('이미지를 처리하지 못했어요.')
  return blob
}

export function ProfileEditor({ user }: { user: AuthUser }) {
  const profile = useProfile(user.id)
  const { toast, confirm, run } = useFeedback()
  const [nick, setNick] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const current = profile?.displayName ?? user.username
  useEffect(() => setNick(current), [current])

  const saveNick = async () => {
    const v = nick.replace(/\s+/g, ' ').trim()
    if (!v) return setError('닉네임을 입력해 주세요.')
    if ([...v].length > MAX_NICK) return setError(`닉네임은 ${MAX_NICK}자까지 쓸 수 있어요.`)
    if (v === current) return
    setSaving(true)
    setError('')
    try {
      await saveNickname(v)
      toast('닉네임을 바꿨어요. 친구와 공유 멤버에게도 바로 보여요.')
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  const pick = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('이미지 파일만 쓸 수 있어요.', 'error')
    setUploading(true)
    await run(async () => uploadAvatar(await squareCrop(file)), '프로필 사진을 바꿨어요.')
    setUploading(false)
  }

  const removePhoto = async () => {
    const ok = await confirm({ title: '프로필 사진을 지울까요?', message: '사진 대신 닉네임 첫 글자가 보여요.', confirmText: '지우기' })
    if (ok) await run(() => deleteAvatar(), '프로필 사진을 지웠어요.')
  }

  return (
    <div className="flex flex-wrap items-start gap-6">
      {/* 사진 */}
      <div className="flex flex-col items-center gap-2.5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="group relative rounded-full focus-visible:ring-[3px] focus-visible:ring-accent-soft focus-visible:outline-none"
          aria-label="프로필 사진 변경"
          title="프로필 사진 변경"
        >
          <Avatar uid={user.id} name={current} size={88} className="border border-line" />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35 text-white opacity-0 transition group-hover:opacity-100">
            {uploading ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
          </span>
          <span className="absolute right-0 bottom-0 flex size-7 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-ink">
            <Camera size={13} />
          </span>
        </button>
        {profile?.avatarVer ? (
          <button type="button" onClick={removePhoto} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-danger">
            <Trash2 size={12} /> 사진 지우기
          </button>
        ) : (
          <span className="text-[12px] text-muted">사진 추가</span>
        )}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
      </div>

      {/* 닉네임 */}
      <div className="min-w-56 flex-1 space-y-3">
        <div>
          <Label hint={`${[...nick].length} / ${MAX_NICK}`}>닉네임</Label>
          <div className="flex gap-2">
            <Input
              value={nick}
              onChange={(e) => { setNick(e.target.value); setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && void saveNick()}
              maxLength={40}
              placeholder="상대방에게 보이는 이름"
              aria-label="닉네임"
            />
            <Button variant="primary" onClick={saveNick} disabled={saving || nick.trim() === current}>저장</Button>
          </div>
          {error && <p className="mt-1.5 text-[12.5px] text-danger" role="alert">{error}</p>}
        </div>
        <p className="text-[12.5px] leading-relaxed text-muted">
          아이디 <b className="font-semibold text-ink-2">@{user.username}</b>는 바꿀 수 없어요. 친구 요청이나 공유 초대는 아이디로 하고,
          화면에는 닉네임과 사진이 보여요.
        </p>
      </div>
    </div>
  )
}
