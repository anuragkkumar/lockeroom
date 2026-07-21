import { io } from 'socket.io-client';
import { getDeviceId, getNickname } from './identity';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

let socket = null;

export function getSocket() {
  if (socket && socket.connected) return socket;
  if (socket) return socket;

  socket = io(BACKEND_URL, {
    path: '/api/socket.io/',
    transports: ['websocket', 'polling'],
    auth: {
      deviceId: getDeviceId(),
      nickname: getNickname() || 'anonymous',
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
