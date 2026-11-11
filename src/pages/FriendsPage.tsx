import { useState } from 'react'
import { Check, Clock3, Inbox, Mail, Send, UserMinus, UserPlus, Users, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, EmptyState, IconButton, PageHeader, Panel, Spinner } from '../components/ui'
import { useFeedback } from '../components/ui/Feedback'
import { Avatar, UserLabel } from '../components/user/UserBits'
import { peekProfile } from '../sync/profiles'
import { acceptFriendRequest, removeFriend, sendFriendRequest, useFriends, type FriendEntry } from '../sync/friends'
import { useAuth } from '../auth/AuthProvider'
import { cn, formatDate, relativeTime } from '../lib/utils'
import { getPastel, wash, washLine } from '../lib/colors'

function PersonRow({ f, sub, actions }: { f: FriendEntry; sub: string; actions: React.ReactNode }) {
  return (
    <div className="-mx-2 flex items-center gap-4 rounded-[var(--radius-ctl)] px-2 py-3.5 transition hover:bg-hover">
      <Avatar uid={f.userId} name={f.username} size={44} />
      <div className="min-w-0 flex-1">
        <UserLabel uid={f.userId} fallback={f.username} className="max-w-full text-[15.5px] font-semibold tracking-[-0.01em]" />
        <p className="mt-0.5 text-[13px] text-muted">{sub}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </div>
  )
}

export default function FriendsPage() {
  // 확인 창·알림 문구에 쓰는 이름 (캐시된 닉네임, 없으면 아이디)
  const nameOf = (f: FriendEntry) => peekProfile(f.userId)?.displayName || f.username
  const { friends, incoming, outgoing, loaded } = useFriends()
  const { user } = useAuth()
  const { toast, confirm, run } = useFeedback()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = name.trim()
    if (!v) return
    setBusy(true)
    setError('')
    try {
      const accepted = await sendFriendRequest(v)
      toast(accepted ? `${v}님과 친구가 되었어요.` : `${v}님에게 친구 요청을 보냈어요.`)
      setName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청을 보내지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  const unfriend = async (f: FriendEntry) => {
    const ok = await confirm({
      title: `${nameOf(f)}님을 친구에서 삭제할까요?`,
      message: '이미 공유한 페이지는 그대로 유지돼요. 공유를 끊으려면 각 카테고리의 공유 설정에서 해제해 주세요.',
      confirmText: '친구 삭제',
      danger: true,
    })
    if (ok) await run(() => removeFriend(f.userId), '친구에서 삭제했어요.')
  }

  const pink = getPastel('pink')

  return (
    <div>
      <PageHeader
        eyebrow={<><Users size={17} strokeWidth={1.6} /> 친구 {friends.length}명{incoming.length ? ` · 받은 요청 ${incoming.length}개` : ''}</>}
        title="Friends"
        description="친구를 맺어두면 페이지를 공유할 때 목록에서 바로 골라 초대할 수 있어요."
      />

      {/* 친구 추가: 홈의 빠른 메모 배너와 같은 톤 */}
      <form
        onSubmit={send}
        className="mb-10 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[var(--radius-card)] border px-6 py-5 sm:px-7"
        style={{ background: wash('pink'), borderColor: washLine('pink') }}
      >
        <UserPlus size={30} strokeWidth={1.4} className="shrink-0" style={{ color: pink.fg }} />
        <div className="min-w-0 basis-80">
          <p className="text-[17px] font-semibold tracking-[-0.01em] text-ink">친구 추가</p>
          <p className="mt-0.5 text-[13.5px] text-muted">
            상대방 아이디로 요청을 보내요. 내 아이디는 <b className="font-semibold text-ink-2">{user?.username}</b>예요.
          </p>
        </div>
        <div className="flex min-w-64 flex-1 flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setError('') }}
            placeholder="친구 아이디"
            maxLength={20}
            aria-label="친구 아이디"
            className="field field-pill h-11 min-w-48 flex-1 px-5"
          />
          <Button type="submit" variant="primary" icon={<Send size={16} />} disabled={busy || !name.trim()}>요청 보내기</Button>
        </div>
        {error && <p className="w-full text-[13px] text-danger" role="alert">{error}</p>}
      </form>

      {!loaded ? (
        <Spinner />
      ) : (
        <div className={cn('grid items-start gap-6', (incoming.length > 0 || outgoing.length > 0) && 'xl:grid-cols-[minmax(0,1fr)_400px]')}>
          <Panel icon={<Users size={20} strokeWidth={1.6} className="text-muted" />} title="내 친구" action={<span className="text-[13.5px] text-muted">{friends.length}명</span>}>
            {friends.length === 0 ? (
              <EmptyState icon={<Users size={22} />} title="아직 친구가 없어요" description="위에서 친구 아이디로 요청을 보내보세요." />
            ) : (
              <div className="divide-y divide-line pb-1">
                {friends.map((f) => (
                  <PersonRow
                    key={f.userId}
                    f={f}
                    sub={`${formatDate(f.at)}부터 친구`}
                    actions={
                      <>
                        <Link
                          to={`/messages?to=${f.userId}`}
                          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong bg-card px-4 text-[13px] font-medium text-ink-2 transition hover:bg-hover hover:text-ink"
                        >
                          <Mail size={15} /> 쪽지 보내기
                        </Link>
                        <IconButton label="친구 삭제" className="hover:text-danger" onClick={() => unfriend(f)}>
                          <UserMinus size={17} />
                        </IconButton>
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </Panel>

          {(incoming.length > 0 || outgoing.length > 0) && (
            <div className="space-y-6">
              {incoming.length > 0 && (
                <Panel
                  icon={<Inbox size={20} strokeWidth={1.6} style={{ color: pink.fg }} />}
                  title="받은 요청"
                  action={<span className="rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold" style={{ background: pink.bg, color: pink.fg }}>{incoming.length}</span>}
                >
                  <div className="divide-y divide-line pb-1">
                    {incoming.map((f) => (
                      <PersonRow
                        key={f.userId}
                        f={f}
                        sub={`${relativeTime(f.at)} 요청`}
                        actions={
                          <>
                            <Button size="sm" variant="primary" icon={<Check size={15} />} onClick={() => run(() => acceptFriendRequest(f.userId), `${nameOf(f)}님과 친구가 되었어요.`)}>
                              수락
                            </Button>
                            <IconButton label="거절" onClick={() => run(() => removeFriend(f.userId), '요청을 거절했어요.')}>
                              <X size={17} />
                            </IconButton>
                          </>
                        }
                      />
                    ))}
                  </div>
                </Panel>
              )}
              {outgoing.length > 0 && (
                <Panel icon={<Clock3 size={20} strokeWidth={1.6} className="text-muted" />} title="보낸 요청" action={<span className="text-[13.5px] text-muted">{outgoing.length}개</span>}>
                  <div className="divide-y divide-line pb-1">
                    {outgoing.map((f) => (
                      <PersonRow
                        key={f.userId}
                        f={f}
                        sub={`${relativeTime(f.at)} 보냄 · 수락 대기 중`}
                        actions={
                          <Button size="sm" onClick={() => run(() => removeFriend(f.userId), '요청을 취소했어요.')}>
                            취소
                          </Button>
                        }
                      />
                    ))}
                  </div>
                </Panel>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
