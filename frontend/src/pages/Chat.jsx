import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { getDeviceId, getNickname, clearNickname } from '@/lib/identity';
import { ALL_PUBLIC_ROOMS, GENERAL_ROOM, SECTION_ROOMS, isPublicRoom, STRANGER_ID } from '@/lib/rooms';
import Sidebar from '@/components/chat/Sidebar';
import ChatHeader from '@/components/chat/ChatHeader';
import MessageFeed from '@/components/chat/MessageFeed';
import MessageInput from '@/components/chat/MessageInput';
import StrangerPanel from '@/components/chat/StrangerPanel';
import { Menu } from 'lucide-react';
import { toast } from 'sonner';

function resolveInitialRoom(searchParams) {
  const tab = searchParams.get('tab');
  if (tab === 'stranger') return STRANGER_ID;
  const room = searchParams.get('room');
  if (room && (room === 'general' || isPublicRoom(room))) return room;
  return 'general';
}

export default function Chat() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const nickname = getNickname();
  const deviceId = getDeviceId();

  const initialRoom = useMemo(() => resolveInitialRoom(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [activeRoom, setActiveRoom] = useState(initialRoom); // 'general' | 'section-x' | '__stranger__'
  const [messagesByRoom, setMessagesByRoom] = useState({}); // { roomId: [msgs] }
  const [onlineByRoom, setOnlineByRoom] = useState({}); // { roomId: number }
  const [unreadByRoom, setUnreadByRoom] = useState({}); // { roomId: number }
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState({}); // { roomId: boolean }
  const [connected, setConnected] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Stranger state
  const [strangerState, setStrangerState] = useState('idle'); // idle | searching | matched
  const [strangerRoom, setStrangerRoom] = useState(null);
  const [strangerMessages, setStrangerMessages] = useState([]);
  const [strangerPartner, setStrangerPartner] = useState(null);

  const activeRoomRef = useRef(activeRoom);
  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
    if (!nickname) {
      navigate('/', { replace: true });
      return;
    }
  }, [nickname, navigate]);

  // Clear query params after they've been used to resolve initial room
  useEffect(() => {
    if (searchParams.get('room') || searchParams.get('tab')) {
      const next = new URLSearchParams();
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Socket setup
  useEffect(() => {
    const s = getSocket();

    const onConnect = () => {
      setConnected(true);
      // Fetch snapshots
      s.emit('presence:snapshot', {}, (res) => {
        if (res?.ok) setOnlineByRoom(res.online);
      });
      s.emit('unread:snapshot', {}, (res) => {
        if (res?.ok) setUnreadByRoom(res.unread);
      });
      // Join initial room
      joinRoom(activeRoomRef.current, { reset: true });
    };

    const onDisconnect = () => setConnected(false);

    const onMessageNew = (msg) => {
      if (typeof msg.room === 'string' && msg.room.startsWith('stranger-')) {
        setStrangerMessages((prev) => [...prev, msg]);
        return;
      }
      setMessagesByRoom((prev) => {
        const list = prev[msg.room] ? [...prev[msg.room], msg] : [msg];
        return { ...prev, [msg.room]: list };
      });
      // If active room, mark read; else bump unread
      if (activeRoomRef.current === msg.room) {
        s.emit('room:markRead', { room: msg.room });
      }
    };

    const onMessageBump = ({ room }) => {
      if (activeRoomRef.current === room) return;
      setUnreadByRoom((prev) => ({ ...prev, [room]: (prev[room] || 0) + 1 }));
    };

    const onPresence = ({ room, online }) => {
      setOnlineByRoom((prev) => ({ ...prev, [room]: online }));
    };

    const onStrangerMatched = ({ room, partnerNickname }) => {
      setStrangerState('matched');
      setStrangerRoom(room);
      setStrangerMessages([]);
      setStrangerPartner(partnerNickname || 'stranger');
      toast.success(`Matched with @${partnerNickname || 'stranger'}`);
    };

    const onStrangerLeft = ({ reason }) => {
      const msg =
        reason === 'skipped'
          ? 'Stranger skipped to another chat'
          : reason === 'disconnected'
            ? 'Stranger disconnected'
            : 'Stranger left';
      toast.message(msg);
      setStrangerState('idle');
      setStrangerRoom(null);
      setStrangerPartner(null);
      setStrangerMessages([]);
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('message:new', onMessageNew);
    s.on('message:bump', onMessageBump);
    s.on('presence:update', onPresence);
    s.on('stranger:matched', onStrangerMatched);
    s.on('stranger:left', onStrangerLeft);

    if (s.connected) onConnect();

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('message:new', onMessageNew);
      s.off('message:bump', onMessageBump);
      s.off('presence:update', onPresence);
      s.off('stranger:matched', onStrangerMatched);
      s.off('stranger:left', onStrangerLeft);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const joinRoom = useCallback((roomId, opts = {}) => {
    if (!isPublicRoom(roomId)) return;
    const s = getSocket();
    s.emit('room:join', { room: roomId }, (res) => {
      if (!res?.ok) return;
      setMessagesByRoom((prev) => ({ ...prev, [roomId]: res.messages }));
      setOnlineByRoom((prev) => ({ ...prev, [roomId]: res.online }));
      setHasMore((prev) => ({ ...prev, [roomId]: (res.messages || []).length >= 50 }));
      s.emit('room:markRead', { room: roomId });
      setUnreadByRoom((prev) => ({ ...prev, [roomId]: 0 }));
    });
  }, []);

  const handleSelectRoom = (roomId) => {
    setSidebarOpen(false);
    if (roomId === STRANGER_ID) {
      setActiveRoom(STRANGER_ID);
      return;
    }
    if (roomId === activeRoom) return;
    setActiveRoom(roomId);
    joinRoom(roomId);
  };

  const sendMessage = (content) => {
    const s = getSocket();
    if (activeRoom === STRANGER_ID) {
      if (strangerState !== 'matched' || !strangerRoom) return;
      s.emit('message:send', { room: strangerRoom, content, nickname });
      return;
    }
    s.emit('message:send', { room: activeRoom, content, nickname }, (res) => {
      if (!res?.ok) toast.error(res?.error || 'Failed to send');
    });
  };

  const loadOlder = () => {
    if (activeRoom === STRANGER_ID) return;
    const list = messagesByRoom[activeRoom] || [];
    if (list.length === 0) return;
    if (loadingOlder) return;
    if (hasMore[activeRoom] === false) return;
    setLoadingOlder(true);
    const first = list[0];
    const s = getSocket();
    s.emit(
      'messages:loadOlder',
      { room: activeRoom, beforeCreatedAt: first.created_at, beforeId: first.id },
      (res) => {
        setLoadingOlder(false);
        if (!res?.ok) return;
        const older = res.messages || [];
        setMessagesByRoom((prev) => ({
          ...prev,
          [activeRoom]: [...older, ...(prev[activeRoom] || [])],
        }));
        setHasMore((prev) => ({ ...prev, [activeRoom]: older.length >= 50 }));
      }
    );
  };

  // Stranger actions
  const findStranger = () => {
    const s = getSocket();
    setStrangerState('searching');
    setStrangerMessages([]);
    setStrangerRoom(null);
    setStrangerPartner(null);
    s.emit('stranger:find', { nickname });
  };

  const cancelSearch = () => {
    const s = getSocket();
    s.emit('stranger:cancel', {}, () => {
      setStrangerState('idle');
    });
  };

  const skipStranger = () => {
    const s = getSocket();
    setStrangerState('searching');
    setStrangerRoom(null);
    setStrangerPartner(null);
    setStrangerMessages([]);
    s.emit('stranger:skip');
  };

  const leaveStranger = () => {
    const s = getSocket();
    s.emit('stranger:leave', {}, () => {
      setStrangerState('idle');
      setStrangerRoom(null);
      setStrangerPartner(null);
      setStrangerMessages([]);
    });
  };

  const reportStranger = () => {
    const s = getSocket();
    s.emit('stranger:report', { room: strangerRoom }, (res) => {
      if (res?.ok) toast.success('Report submitted. Thanks for keeping the community safe.');
      else toast.error(res?.error || 'Could not report');
    });
  };

  const handleLogout = () => {
    clearNickname();
    disconnectSocket();
    navigate('/', { replace: true });
  };

  const activeRoomMeta = useMemo(() => {
    if (activeRoom === STRANGER_ID) return { id: STRANGER_ID, label: 'random-stranger' };
    return ALL_PUBLIC_ROOMS.find((r) => r.id === activeRoom) || GENERAL_ROOM;
  }, [activeRoom]);

  const currentMessages =
    activeRoom === STRANGER_ID ? strangerMessages : messagesByRoom[activeRoom] || [];
  const currentOnline =
    activeRoom === STRANGER_ID ? (strangerState === 'matched' ? 2 : 0) : onlineByRoom[activeRoom] || 0;

  return (
    <div className="h-screen w-full flex bg-[#1e1f22] text-[#f2f3f5] overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        activeRoom={activeRoom}
        onSelect={handleSelectRoom}
        onlineByRoom={onlineByRoom}
        unreadByRoom={unreadByRoom}
        nickname={nickname}
        deviceId={deviceId}
        connected={connected}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={handleLogout}
      />

      {/* Main area */}
      <main
        className="flex-1 flex flex-col bg-[#313338] min-w-0"
        data-testid="chat-main"
      >
        {/* Mobile hamburger */}
        <div className="md:hidden flex items-center gap-2 px-3 h-12 border-b border-[#1e1f22] bg-[#2b2d31]">
          <button
            data-testid="sidebar-toggle-btn"
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md hover:bg-[#404249] transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-mono-ui font-bold tracking-tight">
            #{activeRoomMeta.label}
          </span>
        </div>

        {activeRoom === STRANGER_ID ? (
          <StrangerPanel
            state={strangerState}
            partner={strangerPartner}
            messages={strangerMessages}
            nickname={nickname}
            onFind={findStranger}
            onCancel={cancelSearch}
            onSkip={skipStranger}
            onLeave={leaveStranger}
            onReport={reportStranger}
            onSend={sendMessage}
          />
        ) : (
          <>
            <ChatHeader
              label={activeRoomMeta.label}
              online={currentOnline}
              connected={connected}
            />
            <MessageFeed
              messages={currentMessages}
              nickname={nickname}
              onScrollTop={loadOlder}
              loadingOlder={loadingOlder}
              hasMore={hasMore[activeRoom] !== false}
            />
            <MessageInput
              placeholder={`Message #${activeRoomMeta.label}`}
              onSend={sendMessage}
              disabled={!connected}
            />
          </>
        )}
      </main>
    </div>
  );
}
