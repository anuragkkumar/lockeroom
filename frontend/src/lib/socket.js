import { io } from 'socket.io-client';
import { getDeviceId, getNickname } from './identity';

const BACKEND_URL =
  (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || 'http://localhost:8001';

let socket = null;

export function getSocket() {
  const currentNick = getNickname() || 'anonymous';
  const currentDev = getDeviceId();

  // If socket exists but nickname or device changed, recreate it
  if (socket) {
    if (socket.auth?.nickname !== currentNick || socket.auth?.deviceId !== currentDev) {
      socket.disconnect();
      socket = null;
    } else {
      return socket;
    }
  }

  socket = io(BACKEND_URL, {
    path: '/api/socket.io/',
    transports: ['websocket', 'polling'],
    auth: {
      deviceId: currentDev,
      nickname: currentNick,
    },
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionAttempts: Infinity,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
