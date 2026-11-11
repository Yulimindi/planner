/** 사용자 표시용 작은 컴포넌트: 프로필 사진(없으면 첫 글자)과 닉네임 */
import { avatarUrl, useProfile } from '../../sync/profiles'
import { peerColor } from '../share/presence'
import { cn } from '../../lib/utils'

export function Avatar({ uid, name, size = 28, className }: { uid: string; name: string; size?: number; className?: string }) {
  const p = useProfile(uid)
  const url = avatarUrl(p)
  const label = p?.displayName || name
  if (url) {
    return (
      <img
        src={url}
        alt=""
        draggable={false}
        className={cn('shrink-0 rounded-full object-cover', className)}
        style={{ width: size, height: size }}
      />
    )
  }
  const c = peerColor(uid)
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold', className)}
      style={{ width: size, height: size, background: c.bg, color: c.fg, fontSize: Math.max(10, Math.round(size * 0.4)) }}
      aria-hidden
    >
      {[...label][0]?.toUpperCase() ?? '?'}
    </span>
  )
}

/** 상대에게 보이는 이름 (닉네임, 없으면 아이디) */
export function UserName({ uid, fallback }: { uid: string; fallback: string }) {
  const p = useProfile(uid)
  return <>{p?.displayName || fallback}</>
}

/** 닉네임 + 작은 @아이디 (아이디가 닉네임과 다를 때만) */
export function UserLabel({ uid, fallback, className }: { uid: string; fallback: string; className?: string }) {
  const p = useProfile(uid)
  const name = p?.displayName || fallback
  const handle = p?.username ?? fallback
  return (
    <span className={cn('inline-flex min-w-0 items-baseline gap-1.5', className)}>
      <span className="truncate">{name}</span>
      {handle !== name && <span className="shrink-0 text-[0.85em] font-normal text-muted">@{handle}</span>}
    </span>
  )
}

export function useDisplayName(uid: string | null | undefined, fallback: string): string {
  const p = useProfile(uid)
  return p?.displayName || fallback
}
