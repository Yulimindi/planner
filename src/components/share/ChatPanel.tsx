/**
 * 공유 페이지 오른쪽 대화창.
 * 넓은 화면에서는 본문 옆에 붙어 있고, 좁은 화면에서는 오른쪽에서 밀려 나오는 패널로 뜬다.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MessageCircle, Send, Trash2, X } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { MAX_CHAT, type ChatItem, type useCategoryChat } from '../../sync/chats'
import { cn } from '../../lib/utils'
import { IconButton } from '../ui'
import { Avatar, UserName } from '../user/UserBits'
import type { Peer } from './presence'

type Chat = ReturnType<typeof useCategoryChat>

const hhmm = (ts: number) => new Date(ts).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
const dayKey = (ts: number) => new Date(ts).toDateString()
const dayLabel = (ts: number) => new Date(ts).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })

export function ChatPanel({ chat, peers, onClose, className }: {
  chat: Chat
  peers: Peer[]
  onClose: () => void
  className?: string
}) {
  const { user } = useAuth()
  const { items, hasMore, error, loadMore, send, remove } = chat
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const stickBottom = useRef(true)
  const prevHeight = useRef(0)
  const loadingOlder = useRef(false)

  const online = new Set(peers.map((p) => p.uid))

  // 새 말이 오면 맨 아래에 있을 때만 따라 내려간다. 이전 대화를 불러오면 보던 위치 유지
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    if (loadingOlder.current) {
      el.scrollTop = el.scrollHeight - prevHeight.current
      loadingOlder.current = false
    } else if (stickBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [items])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 입력창 높이 자동 조절
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(140, el.scrollHeight)}px`
  }, [text])

  const submit = async () => {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setSendError('')
    try {
      stickBottom.current = true
      await send(body)
      setText('')
    } catch (e) {
      setSendError(e instanceof Error ? e.message : '보내지 못했어요.')
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const older = async () => {
    const el = listRef.current
    if (el) prevHeight.current = el.scrollHeight
    loadingOlder.current = true
    try {
      await loadMore()
    } catch {
      loadingOlder.current = false
    }
  }

  return (
    <aside className={cn('card flex flex-col overflow-hidden', className)} aria-label="페이지 대화">
      <header className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
        <MessageCircle size={17} strokeWidth={1.7} className="text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold text-ink">대화</p>
          <p className="truncate text-[11.5px] text-muted">
            {peers.length ? `${online.size}명이 함께 보는 중` : '이 페이지를 공유한 사람들과 이야기해요'}
          </p>
        </div>
        <IconButton label="대화창 닫기" onClick={onClose}><X size={17} /></IconButton>
      </header>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
        }}
        className="flex-1 space-y-1 overflow-y-auto px-4 py-4"
      >
        {hasMore && (
          <div className="pb-2 text-center">
            <button type="button" onClick={() => void older()} className="rounded-full px-3 py-1 text-[12px] text-muted hover:bg-hover hover:text-ink">
              이전 대화 더 보기
            </button>
          </div>
        )}
        {items === null ? (
          <p className="py-10 text-center text-[13px] text-muted">불러오는 중…</p>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent">
              <MessageCircle size={20} strokeWidth={1.6} />
            </span>
            <p className="text-[13.5px] font-medium text-ink-2">아직 나눈 대화가 없어요</p>
            <p className="text-[12.5px] text-muted">{error || '첫 마디를 건네 보세요.'}</p>
          </div>
        ) : (
          items.map((m, i) => (
            <ChatLine
              key={m.id}
              item={m}
              prev={items[i - 1]}
              mine={m.userId === user?.id}
              online={online.has(m.userId)}
              onDelete={() => void remove(m.id).catch(() => undefined)}
            />
          ))
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        className="border-t border-line p-3"
      >
        {sendError && <p className="mb-2 px-1 text-[12px] text-danger">{sendError}</p>}
        <div className="flex items-end gap-2 rounded-[var(--radius-ctl)] border border-line bg-app/60 px-3 py-2 focus-within:border-accent/60">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            maxLength={MAX_CHAT}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // 한글 조합 중 Enter는 무시해야 마지막 글자가 두 번 보내지지 않는다
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void submit()
              }
            }}
            placeholder="메시지 입력 (Shift+Enter 줄바꿈)"
            aria-label="메시지 입력"
            className="max-h-[140px] min-h-[24px] flex-1 resize-none bg-transparent py-0.5 text-[14px] leading-[1.6] text-ink outline-none placeholder:text-muted/60"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            aria-label="보내기"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-ink transition disabled:opacity-35"
          >
            <Send size={15} />
          </button>
        </div>
      </form>
    </aside>
  )
}

function ChatLine({ item, prev, mine, online, onDelete }: {
  item: ChatItem
  prev?: ChatItem
  mine: boolean
  online: boolean
  onDelete: () => void
}) {
  const newDay = !prev || dayKey(prev.createdAt) !== dayKey(item.createdAt)
  // 같은 사람이 5분 안에 이어서 보낸 말은 이름·사진을 생략
  const grouped = !newDay && prev?.userId === item.userId && item.createdAt - prev.createdAt < 5 * 60_000

  return (
    <>
      {newDay && (
        <div className="flex items-center gap-3 py-3 text-[11.5px] text-muted">
          <span className="h-px flex-1 bg-line" />
          {dayLabel(item.createdAt)}
          <span className="h-px flex-1 bg-line" />
        </div>
      )}
      <div className={cn('group flex gap-2.5', mine && 'flex-row-reverse', !grouped && 'pt-2')}>
        {!mine && (
          <span className="relative w-8 shrink-0">
            {!grouped && (
              <>
                <Avatar uid={item.userId} name={item.name} size={32} />
                {online && <span className="absolute -right-0.5 bottom-0 size-2.5 rounded-full border-2 border-card bg-[#8FB08A]" title="지금 보는 중" />}
              </>
            )}
          </span>
        )}
        <div className={cn('flex min-w-0 max-w-[78%] flex-col', mine ? 'items-end' : 'items-start')}>
          {!mine && !grouped && (
            <span className="mb-1 px-1 text-[12px] font-medium text-ink-2">
              <UserName uid={item.userId} fallback={item.name} />
            </span>
          )}
          <div className={cn('flex items-end gap-1.5', mine && 'flex-row-reverse')}>
            <p
              className={cn(
                'rounded-[16px] px-3.5 py-2 text-[13.5px] leading-[1.55] break-words whitespace-pre-wrap',
                mine ? 'rounded-tr-[6px] bg-primary text-primary-ink' : 'rounded-tl-[6px] border border-line bg-app',
                grouped && (mine ? 'rounded-tr-[16px]' : 'rounded-tl-[16px]'),
              )}
            >
              {item.body}
            </p>
            <span className="flex shrink-0 flex-col items-center gap-0.5 pb-0.5">
              {mine && (
                <button
                  type="button"
                  onClick={onDelete}
                  aria-label="이 메시지 지우기"
                  className="rounded p-0.5 text-muted opacity-0 transition group-hover:opacity-100 hover:text-danger focus:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              )}
              <span className="text-[10.5px] whitespace-nowrap text-muted tabular-nums">{hhmm(item.createdAt)}</span>
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
