import { Hash, Users } from 'lucide-react';

export default function ChatHeader({ label, online, connected }) {
  return (
    <div
      className="h-14 flex-shrink-0 border-b border-[#1e1f22] bg-[#313338] px-4 md:px-6 flex items-center justify-between"
      data-testid="chat-header"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Hash className="w-5 h-5 text-[#949ba4] flex-shrink-0" />
        <h2 className="font-mono-ui font-bold tracking-tight text-base md:text-lg truncate">
          {label}
        </h2>
      </div>
      <div className="flex items-center gap-4">
        <div
          className="flex items-center gap-1.5 text-xs font-mono-ui text-[#b5bac1]"
          data-testid="chat-header-online"
        >
          <span
            className={
              'w-2 h-2 rounded-full ' +
              (connected && online > 0 ? 'bg-[#23a559] pulse-dot' : 'bg-[#949ba4]')
            }
          />
          <Users className="w-3.5 h-3.5" />
          <span className="tabular-nums">{online}</span>
          <span className="hidden sm:inline text-[#949ba4]">online</span>
        </div>
      </div>
    </div>
  );
}
