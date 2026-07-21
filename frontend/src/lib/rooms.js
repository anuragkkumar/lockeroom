export const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'];

export const GENERAL_ROOM = { id: 'general', label: 'general' };

export const SECTION_ROOMS = SECTIONS.map((s) => ({
  id: `section-${s.toLowerCase()}`,
  label: `section-${s.toLowerCase()}`,
  letter: s,
}));

export const STRANGER_ID = '__stranger__';

export const ALL_PUBLIC_ROOMS = [GENERAL_ROOM, ...SECTION_ROOMS];

export function isPublicRoom(id) {
  return ALL_PUBLIC_ROOMS.some((r) => r.id === id);
}
