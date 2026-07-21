// Device identity helpers: persistent device_id, session nickname
const DEVICE_KEY = 'cs_chatroom_device_id';
const NICKNAME_KEY = 'cs_chatroom_nickname';

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id =
      (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
      `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getNickname() {
  return localStorage.getItem(NICKNAME_KEY) || '';
}

export function setNickname(nickname) {
  localStorage.setItem(NICKNAME_KEY, nickname);
}

export function clearNickname() {
  localStorage.removeItem(NICKNAME_KEY);
}
