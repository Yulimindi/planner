import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Inbox, Mail, MailOpen, PenLine, PictureInPicture2, Reply, Send, Trash2 } from 'lucide-react'
import { toggleMiniMailbox } from '../components/messages/MiniMailboxHost'
import { Button, EmptyState, Input, Label, Modal, PageHeader, Panel, Select, Spinner, Textarea } from '../components/ui'
import { useFeedback } from '../components/ui/Feedback'
import { Avatar, UserName } from '../components/user/UserBits'
import { peekProfile } from '../sync/profiles'
import { peerColor } from '../components/share/presence'
import { useAuth } from '../auth/AuthProvider'
import { useFriends } from '../sync/friends'
import {
  MAX_BODY, MAX_SUBJECT, deleteMessage, fetchBox, onMessagesEvent, openMessage, sendMessage, type MessageItem,
} from '../sync/messages'
import { cn, excerpt, formatDate, mmdd } from '../lib/utils'
import { useProfile } from '../sync/profiles'

type Box = 'inbox' | 'sent'

const titleOf = (m: MessageItem) => m.subject || excerpt(m.body.split('\n')[0], 40) || '(제목 없음)'

/* ── 쪽지 쓰기 ───────────────────────────────────────────── */
function FriendOption({ id, username }: { id: string; username: string }) {
  const p = useProfile(id)
  const name = p?.displayName || username
  return <option value={id}>{name !== username ? `${name} (@${username})` : name}</option>
}

export function ComposeModal({ open, onClose, defaultTo, defaultSubject, onSent }: {
  open: boolean
  onClose: () => void
  defaultTo?: string
  defaultSubject?: string
  onSent?: (m: MessageItem) => void
}) {
  const { friends } = useFriends()
  const { toast } = useFeedback()
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTo(defaultTo ?? '')
    setSubject(defaultSubject ?? '')
    setBody('')
    setError('')
  }, [open, defaultTo, defaultSubject])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!to) return setError('받는 사람을 골라 주세요.')
    if (!body.trim()) return setError('쪽지 내용을 적어 주세요.')
    setBusy(true)
    try {
      const m = await sendMessage(to, subject, body)
      toast(`${peekProfile(m.toId)?.displayName || m.toName}님에게 쪽지를 보냈어요.`)
      onSent?.(m)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '쪽지를 보내지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="쪽지 쓰기"
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button type="submit" form="compose-form" variant="primary" icon={<Send size={15} />} disabled={busy || !friends.length}>보내기</Button>
        </>
      }
    >
      {friends.length === 0 ? (
        <p className="rounded-[var(--radius-ctl)] bg-side px-4 py-3.5 text-[13.5px] text-muted">
          쪽지는 친구에게만 보낼 수 있어요. 먼저 <Link to="/friends" onClick={onClose} className="font-medium text-ink-2 underline underline-offset-2">Friends</Link>에서 친구를 추가해 주세요.
        </p>
      ) : (
        <form id="compose-form" onSubmit={submit} className="space-y-4">
          <div>
            <Label>받는 사람</Label>
            <Select value={to} onChange={(e) => { setTo(e.target.value); setError('') }} autoFocus={!defaultTo}>
              <option value="">친구를 선택하세요</option>
              {friends.map((f) => <FriendOption key={f.userId} id={f.userId} username={f.username} />)}
            </Select>
          </div>
          <div>
            <Label hint="선택">제목</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={MAX_SUBJECT} placeholder="예: 주말 계획" />
          </div>
          <div>
            <Label hint={`${body.length} / ${MAX_BODY}`}>내용</Label>
            <Textarea
              value={body}
              onChange={(e) => { setBody(e.target.value); setError('') }}
              maxLength={MAX_BODY}
              autoFocus={!!defaultTo}
              placeholder="전하고 싶은 말을 적어보세요."
              className="min-h-48 leading-[1.8]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  ;(e.currentTarget.form as HTMLFormElement | null)?.requestSubmit()
                }
              }}
            />
          </div>
          {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
        </form>
      )}
    </Modal>
  )
}

/* ── 쪽지 한 장 ─────────────────────────────────────────── */
function Letter({ m, box, onReply, onDelete, onBack }: {
  m: MessageItem
  box: Box
  onReply: () => void
  onDelete: () => void
  onBack: () => void
}) {
  const other = box === 'inbox' ? { id: m.fromId, name: m.fromName } : { id: m.toId, name: m.toName }
  const c = peerColor(other.id)
  return (
    <article className="card overflow-hidden">
      {/* 보낸 사람 색의 얇은 띠 */}
      <div className="h-1.5" style={{ background: `color-mix(in srgb, ${c.bg} var(--tint), var(--card-bg))` }} />
      <div className="px-6 pt-6 pb-7 sm:px-10 sm:pt-8 sm:pb-10">
        <div className="mb-6 flex items-center gap-2 xl:hidden">
          <Button size="sm" variant="ghost" icon={<ArrowLeft size={15} />} onClick={onBack}>목록</Button>
        </div>
        <div className="flex flex-wrap items-start gap-4">
          <Avatar uid={other.id} name={other.name} size={48} />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] text-muted">{box === 'inbox' ? 'From.' : 'To.'}</p>
            <p className="text-[17px] font-semibold text-ink"><UserName uid={other.id} fallback={other.name} /></p>
          </div>
          <div className="text-right text-[13px] text-muted">
            <p>{formatDate(m.createdAt, true)}</p>
            {box === 'sent' && (
              <p className={cn('mt-0.5 inline-flex items-center gap-1', m.readAt ? 'text-ink-2' : '')}>
                {m.readAt ? <><MailOpen size={13} /> {formatDate(m.readAt, true)} 읽음</> : <><Mail size={13} /> 아직 읽지 않음</>}
              </p>
            )}
          </div>
        </div>

        <h2 className="mt-8 text-[24px] leading-snug font-bold tracking-[-0.02em] text-ink sm:text-[26px]">{titleOf(m)}</h2>
        <div className="mt-6 border-t border-dashed border-line-strong pt-6">
          <p className="text-[16px] leading-[1.9] whitespace-pre-wrap text-ink">{m.body}</p>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-2">
          {box === 'inbox' && <Button variant="primary" icon={<Reply size={16} />} onClick={onReply}>답장하기</Button>}
          <Button icon={<Trash2 size={15} />} onClick={onDelete}>삭제</Button>
        </div>
      </div>
    </article>
  )
}

/* ── 쪽지함 ─────────────────────────────────────────────── */
export default function MessagesPage() {
  const { user } = useAuth()
  const { confirm, run } = useFeedback()
  const [params, setParams] = useSearchParams()
  const box: Box = params.get('box') === 'sent' ? 'sent' : 'inbox'
  const selectedId = params.get('id')
  const composeTo = params.get('to')

  const [items, setItems] = useState<MessageItem[] | null>(null)
  const [current, setCurrent] = useState<MessageItem | null>(null)
  const [compose, setCompose] = useState<{ open: boolean; to?: string; subject?: string }>({ open: false })

  const load = useCallback(async () => {
    try {
      setItems(await fetchBox(box))
    } catch {
      setItems((prev) => prev ?? [])
    }
  }, [box])

  useEffect(() => {
    setItems(null)
    void load()
  }, [load])

  // 친구 목록 등에서 ?to=로 들어오면 바로 쓰기 창 열기
  useEffect(() => {
    if (!composeTo) return
    setCompose({ open: true, to: composeTo })
    params.delete('to')
    setParams(params, { replace: true })
  }, [composeTo, params, setParams])

  // 실시간: 새 쪽지·읽음 표시가 오면 목록 갱신
  useEffect(() => onMessagesEvent(() => void load()), [load])

  // 선택한 쪽지 열기 (받은 쪽지는 이때 읽음 처리)
  useEffect(() => {
    if (!selectedId) {
      setCurrent(null)
      return
    }
    let alive = true
    openMessage(selectedId)
      .then((m) => {
        if (!alive) return
        setCurrent(m)
        setItems((list) => list?.map((x) => (x.id === m.id ? m : x)) ?? list)
      })
      .catch(() => alive && setCurrent(null))
    return () => {
      alive = false
    }
  }, [selectedId])

  const select = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('id', id)
    else next.delete('id')
    setParams(next)
  }
  const switchBox = (b: Box) => setParams(b === 'sent' ? { box: 'sent' } : {})

  const remove = async (m: MessageItem) => {
    const ok = await confirm({
      title: '쪽지를 삭제할까요?',
      message: '내 쪽지함에서만 지워지고, 상대방 쪽지함에는 그대로 남아요.',
      confirmText: '삭제',
      danger: true,
    })
    if (!ok) return
    await run(async () => {
      await deleteMessage(m.id)
      select(null)
      await load()
    }, '쪽지를 삭제했어요.')
  }

  const unreadHere = useMemo(() => (box === 'inbox' ? (items ?? []).filter((m) => !m.readAt).length : 0), [items, box])

  return (
    <div>
      <PageHeader
        eyebrow={<><Mail size={17} strokeWidth={1.6} /> {box === 'inbox' ? `안 읽은 쪽지 ${unreadHere}통` : '보낸 쪽지'}</>}
        title="Messages"
        description="친구와 짧은 쪽지를 주고받아요. 대화방이 아니라 한 장씩 보내는 편지예요."
        actions={
          <>
            <Button className="hidden md:inline-flex" icon={<PictureInPicture2 size={16} />} onClick={toggleMiniMailbox} title="다른 창 위에 작게 띄워두고 쪽지를 확인해요">
              미니 쪽지창
            </Button>
            <Button variant="primary" icon={<PenLine size={16} />} onClick={() => setCompose({ open: true })}>쪽지 쓰기</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        {/* 목록 (모바일에서는 쪽지를 열면 숨김) */}
        <Panel
          className={cn(current && 'hidden xl:flex')}
          icon={<Inbox size={20} strokeWidth={1.6} className="text-muted" />}
          title="쪽지함"
          action={
            <div className="flex items-center gap-1 text-[13.5px]">
              {([['inbox', '받은 쪽지'], ['sent', '보낸 쪽지']] as const).map(([b, label]) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => switchBox(b)}
                  aria-pressed={box === b}
                  className={cn('rounded-md px-2 py-1 transition', box === b ? 'font-semibold text-ink' : 'text-muted hover:text-ink')}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        >
          {!items ? (
            <Spinner />
          ) : items.length === 0 ? (
            <p className="py-14 text-center text-[13.5px] text-muted">{box === 'inbox' ? '받은 쪽지가 없어요.' : '보낸 쪽지가 없어요.'}</p>
          ) : (
            <ul className="divide-y divide-line pb-1">
              {items.map((m) => {
                const other = box === 'inbox' ? { id: m.fromId, name: m.fromName } : { id: m.toId, name: m.toName }
                const unread = box === 'inbox' && !m.readAt
                const active = m.id === selectedId
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => select(m.id)}
                      className={cn(
                        '-mx-2 flex w-[calc(100%+1rem)] items-center gap-3.5 rounded-[var(--radius-ctl)] px-2 py-3.5 text-left transition',
                        active ? 'bg-accent-soft' : 'hover:bg-hover',
                      )}
                    >
                      <span className="relative">
                        <Avatar uid={other.id} name={other.name} size={42} />
                        {unread && <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-primary" aria-label="안 읽음" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className={cn('truncate text-[14.5px]', unread ? 'font-bold text-ink' : 'font-semibold text-ink-2')}><UserName uid={other.id} fallback={other.name} /></span>
                          <span className="ml-auto shrink-0 text-[12.5px] text-muted tabular-nums">{mmdd(m.createdAt)}</span>
                        </span>
                        <span className={cn('mt-0.5 block truncate text-[14px]', unread ? 'font-semibold text-ink' : 'text-ink-2')}>{titleOf(m)}</span>
                        <span className="mt-0.5 block truncate text-[13px] text-muted">
                          {box === 'sent' && <span className={m.readAt ? 'text-ink-2' : ''}>{m.readAt ? '읽음 · ' : '안 읽음 · '}</span>}
                          {excerpt(m.body, 60)}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        {/* 읽기 */}
        <div className={cn(!current && 'hidden xl:block')}>
          {current ? (
            <Letter
              m={current}
              box={current.fromId === user?.id ? 'sent' : 'inbox'}
              onBack={() => select(null)}
              onReply={() => setCompose({ open: true, to: current.fromId, subject: current.subject ? `Re: ${current.subject}`.slice(0, MAX_SUBJECT) : '' })}
              onDelete={() => remove(current)}
            />
          ) : (
            <EmptyState
              icon={<Mail size={22} />}
              title="쪽지를 선택하세요"
              description="왼쪽 쪽지함에서 쪽지를 고르면 여기에 펼쳐져요."
              action={<Button icon={<PenLine size={15} />} onClick={() => setCompose({ open: true })}>새 쪽지 쓰기</Button>}
            />
          )}
        </div>
      </div>

      <ComposeModal
        open={compose.open}
        defaultTo={compose.to}
        defaultSubject={compose.subject}
        onClose={() => setCompose({ open: false })}
        onSent={() => {
          if (box === 'sent') void load()
        }}
      />
    </div>
  )
}
