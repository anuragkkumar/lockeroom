import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function colorForNick(nick) {
  const colors = ['#5865f2', '#23a559', '#f0b232', '#eb459f', '#00a8fc', '#f47b67', '#a68af9'];
  let h = 0;
  for (let i = 0; i < nick.length; i++) h = (h * 31 + nick.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

export default function MessageFeed({ messages, nickname, onScrollTop, loadingOlder, hasMore }) {
  const containerRef = useRef(null);
  const endRef = useRef(null);
  const prevScrollHeight = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const wasAtBottomRef = useRef(true);

  // Auto-scroll to bottom on new message when user is near bottom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    // Restore scroll position after loading older
    if (prevScrollHeight.current && el.scrollHeight > prevScrollHeight.current) {
      const diff = el.scrollHeight - prevScrollHeight.current;
      if (!wasAtBottomRef.current) {
        el.scrollTop = diff + el.scrollTop;
      }
      prevScrollHeight.current = 0;
    }
  }, [messages]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    wasAtBottomRef.current = distFromBottom < 80;
    setShowJump(!wasAtBottomRef.current);

    // Load older when scrolled to top
    if (el.scrollTop < 60 && !loadingOlder && hasMore) {
      prevScrollHeight.current = el.scrollHeight;
      onScrollTop?.();
    }
  };

  const jumpToBottom = () => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // Group messages by date and consecutive sender
  const grouped = [];
  let lastDate = null;
  let lastAuthor = null;
  let lastTs = 0;
  messages.forEach((m, i) => {
    const d = new Date(m.created_at).toDateString();
    if (d !== lastDate) {
      grouped.push({ type: 'divider', id: `d-${d}-${i}`, ts: m.created_at });
      lastDate = d;
      lastAuthor = null;
    }
    const isSameAuthor = lastAuthor === m.nickname && m.created_at - lastTs < 5 * 60 * 1000;
    grouped.push({ type: 'msg', msg: m, compact: isSameAuthor });
    lastAuthor = m.nickname;
    lastTs = m.created_at;
  });

  return (
    <div className="flex-1 relative min-h-0">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        data-testid="message-feed"
        className="h-full overflow-y-auto chat-scroll px-4 md:px-6 py-4"
      >
        {loadingOlder && (
          <div className="flex justify-center py-2 text-[#949ba4] text-xs font-mono-ui">
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> loading older…
          </div>
        )}
        {!hasMore && messages.length > 0 && (
          <div className="text-center py-3 text-[10px] uppercase tracking-[0.25em] text-[#5c6069] font-mono-ui">
            — start of channel —
          </div>
        )}

        {messages.length === 0 && !loadingOlder && (
          <div className="h-full flex items-center justify-center text-center">
            <div>
              <p className="font-mono-ui text-xl md:text-2xl font-extrabold tracking-tight text-[#f2f3f5]">
                a quiet channel.
              </p>
              <p className="mt-2 text-sm text-[#949ba4]">
                Be the first to say something. Everyone can see it.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-0.5">
          {grouped.map((item, idx) => {
            if (item.type === 'divider') {
              return (
                <div key={item.id} className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-[#1e1f22]" />
                  <span className="text-[10px] uppercase tracking-[0.25em] font-mono-ui text-[#5c6069] font-bold">
                    {formatDate(item.ts)}
                  </span>
                  <div className="flex-1 h-px bg-[#1e1f22]" />
                </div>
              );
            }
            const { msg, compact } = item;
            const isSelf = msg.nickname === nickname;
            const color = colorForNick(msg.nickname);
            return (
              <div
                key={`${msg.id}-${idx}`}
                data-testid="chat-message"
                className={`msg-enter group px-2 py-0.5 rounded-md hover:bg-[#2e3035]/60 ${
                  compact ? 'pl-14 -mt-1' : 'mt-3'
                }`}
              >
                {!compact ? (
                  <div className="flex items-baseline gap-2">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-mono-ui text-xs font-bold text-white flex-shrink-0 mt-0.5"
                      style={{ background: color }}
                    >
                      {msg.nickname.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span
                          className="font-mono-ui font-bold text-sm"
                          style={{ color }}
                        >
                          @{msg.nickname}
                          {isSelf && (
                            <span className="ml-1 text-[9px] uppercase tracking-widest text-[#949ba4] font-normal">
                              you
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-[#5c6069] font-mono-ui">
                          {formatTime(msg.created_at)}
                        </span>
                      </div>
                      <div className="text-[15px] text-[#dbdee1] leading-relaxed break-words whitespace-pre-wrap">
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative text-[15px] text-[#dbdee1] leading-relaxed break-words whitespace-pre-wrap">
                    <span className="absolute -left-12 top-1 text-[10px] text-transparent group-hover:text-[#5c6069] font-mono-ui">
                      {formatTime(msg.created_at)}
                    </span>
                    {msg.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div ref={endRef} />
      </div>

      {showJump && (
        <button
          onClick={jumpToBottom}
          data-testid="jump-to-bottom"
          className="absolute bottom-3 right-4 bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-mono-ui font-bold px-3 py-2 rounded-full shadow-lg transition-colors"
        >
          jump to present ↓
        </button>
      )}
    </div>
  );
}
