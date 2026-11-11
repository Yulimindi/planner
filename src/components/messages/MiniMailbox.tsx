/**
 * 미니 쪽지창: 아주 작은 창에서 받은 쪽지를 확인하고 바로 답장.
 * 항상 위 창(Document Picture-in-Picture)이나 페이지 위 작은 패널 안에서 그려진다.
 * 라우터·컨텍스트에 의존하지 않도록 필요한 동작은 props로 받는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ExternalLink, Mail, Send, X } from 'lucide-react'
import { fetchBox, onMessagesEvent, openMessage, sendMessage, useUnreadMessages, type MessageItem } from '../../sync/messages'
import { peerColor } from '../share/presence'
import { cn, excerpt, relativeTime } from '../../lib/utils'

function MiniAvatar({ uid, name, size = 30 }: { uid: string; name: string; size?: number }) {
  const c = peerColor(uid)
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
      style={{ width: size, height: size, background: c.bg, color: c.fg }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

const titleOf = (m: MessageItem) => m.subject || excerpt(m.body.split('\n')[0], 30) || '(제목 없음)'

export function MiniMailbox({ onClose, onOpenInApp }: {
  onClose: () => void
  /** 앱 본 창에서 쪽지(또는 쪽지함) 열기 */
  onOpenInApp: (id?: string) => void
}) {
  const unread = useUnreadMessages()
  const [items, setItems] = useState<MessageItem[] | null>(null)
  const [current, setCurrent] = useState<MessageItem | null>(null)
  const [reply, setReply] = useState('')
  const [status, setStatus] = useState<'' | 'sending' | 'sent' | 'error'>('')
  const [fresh, setFresh] = useState<Set<string>>(new Set())

  const known = useRef<Set<string> | null>(null)

  const load = useCallback(async () => {
    try {
      const list = (await fetchBox('inbox')).slice(0, 30)
      // 창을 연 뒤 새로 도착한 쪽지는 잠깐 강조
      if (known.current) {
        const added = list.filter((m) => !known.current!.has(m.id)).map((m) => m.id)
        if (added.length) {
          setFresh(new Set(added))
          setTimeout(() => setFresh(new Set()), 4000)
        }
      }
      known.current = new Set(list.map((m) => m.id))
      setItems(list)
    } catch {
      setItems((p) => p ?? [])
    }
  }, [])

  useEffect(() => {
    void load()
    return onMessagesEvent(() => void load())
  }, [load])

  const open = async (m: MessageItem) => {
    setReply('')
    setStatus('')
    setCurrent(m)
    try {
      const full = await openMessage(m.id)
      setCurrent(full)
      setItems((list) => list?.map((x) => (x.id === full.id ? full : x)) ?? list)
    } catch {
      /* 이미 삭제된 쪽지 등 */
    }
  }

  const send = async () => {
    if (!current || !reply.trim()) return
    setStatus('sending')
    try {
      const subject = current.subject ? `Re: ${current.subject}`.slice(0, 80) : ''
      await sendMessage(current.fromId, subject, reply)
      setReply('')
      setStatus('sent')
      setTimeout(() => setStatus(''), 2500)
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="flex h-full flex-col bg-app text-ink">
      {/* 머리 */}
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-side px-3">
        {current ? (
          <button type="button" onClick={() => setCurrent(null)} className="-ml-1 flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink" aria-label="목록으로">
            <ArrowLeft size={16} />
          </button>
        ) : (
          <Mail size={16} strokeWidth={1.7} className="text-accent" />
        )}
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{current ? current.fromName : '쪽지'}</span>
        {!current && unread > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-[11px] leading-[18px] font-semibold text-primary-ink">{unread}</span>
        )}
        <button type="button" title="앱에서 열기" aria-label="앱에서 열기" onClick={() => onOpenInApp(current?.id)} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink">
          <ExternalLink size={14} />
        </button>
        <button type="button" title="닫기" aria-label="미니 쪽지창 닫기" onClick={onClose} className="-mr-1 flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink">
          <X size={15} />
        </button>
      </header>

      {/* 본문 */}
      {current ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
            <p className="text-[11.5px] text-muted">{relativeTime(current.createdAt)}</p>
            <p className="mt-1 text-[15px] leading-snug font-bold tracking-[-0.01em]">{titleOf(current)}</p>
            <p className="mt-2.5 border-t border-dashed border-line-strong pt-2.5 text-[13.5px] leading-[1.75] whitespace-pre-wrap">{current.body}</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
            className="shrink-0 border-t border-line bg-card p-2"
          >
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  void send()
                }
              }}
              rows={2}
              maxLength={2000}
              placeholder={`${current.fromName}님에게 답장…`}
              className="block w-full resize-none rounded-lg bg-side/70 px-2.5 py-2 text-[13px] outline-none placeholder:text-muted/70 focus:ring-2 focus:ring-accent-soft"
            />
            <div className="mt-1.5 flex items-center justify-between">
              <span className={cn('text-[11.5px]', status === 'error' ? 'text-danger' : 'text-muted')}>
                {status === 'sent' ? '답장을 보냈어요' : status === 'error' ? '보내지 못했어요' : 'Ctrl/⌘ + Enter'}
              </span>
              <button
                type="submit"
                disabled={!reply.trim() || status === 'sending'}
                className="inline-flex h-7 items-center gap-1 rounded-full bg-primary px-3 text-[12px] font-semibold text-primary-ink disabled:opacity-45"
              >
                <Send size={12} /> 답장
              </button>
            </div>
          </form>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {!items ? (
            <li className="py-10 text-center text-[12.5px] text-muted">불러오는 중…</li>
          ) : items.length === 0 ? (
            <li className="py-12 text-center text-[12.5px] text-muted">받은 쪽지가 없어요</li>
          ) : (
            items.map((m) => {
              const isUnread = !m.readAt
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => void open(m)}
                    className={cn(
                      'flex w-full items-center gap-2.5 border-b border-line px-3 py-2.5 text-left transition hover:bg-hover',
                      fresh.has(m.id) && 'bg-accent-soft',
                    )}
                  >
                    <span className="relative">
                      <MiniAvatar uid={m.fromId} name={m.fromName} />
                      {isUnread && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-app bg-primary" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className={cn('truncate text-[13px]', isUnread ? 'font-bold' : 'font-medium text-ink-2')}>{m.fromName}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-muted">{relativeTime(m.createdAt)}</span>
                      </span>
                      <span className={cn('block truncate text-[12.5px]', isUnread ? 'font-semibold text-ink' : 'text-muted')}>{titleOf(m)}</span>
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
