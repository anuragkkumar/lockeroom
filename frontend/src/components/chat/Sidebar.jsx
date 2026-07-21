import { Hash, Dice5, LogOut, Wifi, WifiOff, X, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GENERAL_ROOM, SECTION_ROOMS, STRANGER_ID } from '@/lib/rooms';
import { cn } from '@/lib/utils';

function ChannelItem({ room, isActive, unread, online, onClick }) {
  return (
    <button
      onClick={onClick}
      data-testid={`channel-${room.id}`}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 rounded-md font-mono-ui text-sm transition-colors group text-left',
        isActive
          ? 'bg-[#404249] text-white'
          : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'
      )}
    >
      <Hash className="w-4 h-4 flex-shrink-0 opacity-70" />
      <span className="flex-1 truncate">{room.label}</span>
      {online > 0 && (
        <span
          data-testid={`online-count-${room.id}`}
          className="text-[10px] text-[#949ba4] font-medium tabular-nums"
        >
          {online}
        </span>
      )}
      {unread > 0 && !isActive && (
        <span
          data-testid={`unread-badge-${room.id}`}
          className="ml-1 min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#23a559] text-white text-[10px] font-bold flex items-center justify-center tabular-nums"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}

export default function Sidebar({
  activeRoom,
  onSelect,
  onlineByRoom,
  unreadByRoom,
  nickname,
  deviceId,
  connected,
  open,
  onClose,
  onLogout,
}) {
  const initials = (nickname || '?').slice(0, 2).toUpperCase();

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-30"
          onClick={onClose}
        />
      )}

      <aside
        data-testid="sidebar"
        className={cn(
          'w-72 flex-shrink-0 bg-[#2b2d31] border-r border-[#1e1f22] flex flex-col h-full',
          'md:static md:translate-x-0 md:z-auto',
          'fixed top-0 left-0 z-40 transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-[#1e1f22]">
          <Link
            to="/"
            data-testid="sidebar-home-link"
            title="Back to home (keeps your nickname)"
            className="flex items-center gap-2 group focus:outline-none rounded-md -mx-1 px-1 py-1 hover:bg-[#35373c] transition-colors"
          >
            <div className="w-7 h-7 rounded-md bg-[#5865f2] flex items-center justify-center group-hover:bg-[#4752c4] transition-colors">
              <Hash className="w-4 h-4 text-white" />
            </div>
            <span className="font-mono-ui font-extrabold tracking-tight text-[15px] text-[#f2f3f5]">
              cs<span className="text-[#23a559]">.</span>chatroom
            </span>
          </Link>
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded hover:bg-[#404249] text-[#949ba4]"
            data-testid="sidebar-close-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Channels list */}
        <div className="flex-1 overflow-y-auto sidebar-scroll px-2 py-4 space-y-6">
          <div>
            <div className="px-3 mb-1 font-mono-ui text-[10px] uppercase tracking-[0.25em] text-[#5c6069] font-bold">
              general
            </div>
            <div className="space-y-0.5">
              <ChannelItem
                room={GENERAL_ROOM}
                isActive={activeRoom === GENERAL_ROOM.id}
                unread={unreadByRoom[GENERAL_ROOM.id] || 0}
                online={onlineByRoom[GENERAL_ROOM.id] || 0}
                onClick={() => onSelect(GENERAL_ROOM.id)}
              />
            </div>
          </div>

          <div>
            <div className="px-3 mb-1 font-mono-ui text-[10px] uppercase tracking-[0.25em] text-[#5c6069] font-bold">
              sections · A → R
            </div>
            <div className="space-y-0.5">
              {SECTION_ROOMS.map((room) => (
                <ChannelItem
                  key={room.id}
                  room={room}
                  isActive={activeRoom === room.id}
                  unread={unreadByRoom[room.id] || 0}
                  online={onlineByRoom[room.id] || 0}
                  onClick={() => onSelect(room.id)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Random stranger pinned */}
        <div className="px-2 py-2 border-t border-[#1e1f22]">
          <button
            data-testid="random-stranger-btn"
            onClick={() => onSelect(STRANGER_ID)}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2.5 rounded-md font-mono-ui text-sm font-bold transition-colors',
              activeRoom === STRANGER_ID
                ? 'bg-[#5865f2] text-white'
                : 'bg-[#404249] hover:bg-[#4e5058] text-[#f2f3f5]'
            )}
          >
            <Dice5 className="w-4 h-4" />
            <span className="flex-1 text-left">random-stranger</span>
            <span className="text-[10px] uppercase tracking-widest opacity-70">go</span>
          </button>
        </div>

        {/* User strip */}
        <div className="bg-[#232428] px-3 py-2.5 flex items-center gap-2">
          <div className="relative w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center font-mono-ui text-xs font-bold text-white flex-shrink-0">
            {initials}
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#232428]',
                connected ? 'bg-[#23a559]' : 'bg-[#949ba4]'
              )}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="font-mono-ui text-sm font-bold truncate text-[#f2f3f5]"
              data-testid="current-nickname"
            >
              @{nickname}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-[#949ba4] font-mono-ui">
              {connected ? (
                <>
                  <Wifi className="w-3 h-3 text-[#23a559]" /> online
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" /> connecting…
                </>
              )}
            </div>
          </div>
          <button
            onClick={onLogout}
            data-testid="logout-btn"
            title="Sign out — clears your nickname and returns to landing"
            className="p-2 rounded-md text-[#949ba4] hover:text-[#f2f3f5] hover:bg-[#404249] transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </>
  );
}
