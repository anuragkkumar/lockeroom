import { Dice5, SkipForward, Flag, X, Loader2, Search, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import MessageFeed from './MessageFeed';
import MessageInput from './MessageInput';

export default function StrangerPanel({
  state,
  partner,
  messages,
  nickname,
  onFind,
  onCancel,
  onSkip,
  onLeave,
  onReport,
  onSend,
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0" data-testid="stranger-panel">
      {/* Header */}
      <div className="h-14 flex-shrink-0 border-b border-[#1e1f22] bg-[#313338] px-4 md:px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dice5 className="w-5 h-5 text-[#5865f2]" />
          <h2 className="font-mono-ui font-bold tracking-tight text-base md:text-lg">
            random-stranger
          </h2>
          {state === 'matched' && partner && (
            <span className="ml-2 text-xs font-mono-ui text-[#23a559]">
              · matched with @{partner}
            </span>
          )}
          {state === 'searching' && (
            <span className="ml-2 text-xs font-mono-ui text-[#f0b232] flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> searching…
            </span>
          )}
        </div>
        {state === 'matched' && (
          <div className="flex items-center gap-2">
            <button
              onClick={onReport}
              data-testid="stranger-report-btn"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono-ui font-bold text-[#da373c] hover:bg-[#da373c]/10 transition-colors"
            >
              <Flag className="w-3.5 h-3.5" /> report
            </button>
            <button
              onClick={onSkip}
              data-testid="stranger-skip-btn"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono-ui font-bold bg-[#4e5058] hover:bg-[#5c5f66] text-white transition-colors"
            >
              <SkipForward className="w-3.5 h-3.5" /> skip
            </button>
            <button
              onClick={onLeave}
              data-testid="stranger-leave-btn"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono-ui font-bold text-[#949ba4] hover:text-white hover:bg-[#404249] transition-colors"
            >
              <X className="w-3.5 h-3.5" /> leave
            </button>
          </div>
        )}
        {state === 'searching' && (
          <button
            onClick={onCancel}
            data-testid="stranger-cancel-btn"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono-ui font-bold bg-[#4e5058] hover:bg-[#5c5f66] text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" /> cancel
          </button>
        )}
        {state === 'idle' && (
          <Link
            to="/"
            data-testid="stranger-home-btn"
            title="Back to home"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono-ui font-bold text-[#dbdee1] bg-[#404249] hover:bg-[#4e5058] transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">home</span>
          </Link>
        )}
      </div>

      {state === 'idle' && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#5865f2]/15 flex items-center justify-center mb-6">
              <Dice5 className="w-8 h-8 text-[#5865f2]" />
            </div>
            <h3 className="font-mono-ui text-3xl font-extrabold tracking-tight">
              chat with a stranger.
            </h3>
            <p className="mt-3 text-sm text-[#b5bac1]">
              You&apos;ll be paired 1-to-1 with another student. Ephemeral · no history saved · skip anytime.
            </p>
            <button
              onClick={onFind}
              data-testid="stranger-find-btn"
              className="mt-8 inline-flex items-center gap-2 bg-[#5865f2] hover:bg-[#4752c4] text-white font-mono-ui font-bold text-sm px-6 py-3 rounded-full transition-colors"
            >
              <Search className="w-4 h-4" /> find a stranger
            </button>
            <p className="mt-4 text-[10px] uppercase tracking-[0.25em] font-mono-ui text-[#5c6069]">
              you are chatting as @{nickname}
            </p>
          </div>
        </div>
      )}

      {state === 'searching' && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <Loader2 className="w-10 h-10 mx-auto text-[#5865f2] animate-spin" />
            <p className="mt-6 font-mono-ui text-xl font-bold tracking-tight">
              looking for someone…
            </p>
            <p className="mt-2 text-sm text-[#949ba4]">
              This usually takes a few seconds. Feel free to keep the tab open.
            </p>
          </div>
        </div>
      )}

      {state === 'matched' && (
        <>
          <MessageFeed
            messages={messages}
            nickname={nickname}
            onScrollTop={() => {}}
            loadingOlder={false}
            hasMore={false}
          />
          <MessageInput
            placeholder={`Message @${partner || 'stranger'}`}
            onSend={onSend}
            disabled={false}
          />
        </>
      )}
    </div>
  );
}
