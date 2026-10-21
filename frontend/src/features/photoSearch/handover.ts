/**
 * "사진으로 찾기" → "내 물건 찾기" registration. Kept in memory (not router state) so it survives the login
 * screen in between; it is taken once, only by a signed-in registration form, and expires after 30 minutes.
 */
export interface PhotoHandover { file: File; title: string; category: string; color: string }
const TTL_MS = 30 * 60_000;
let pending: (PhotoHandover & { at: number }) | null = null;

export function setPhotoHandover(value: PhotoHandover, now = Date.now()): void {
  pending = { ...value, at: now };
}

export function takePhotoHandover(now = Date.now()): PhotoHandover | null {
  const value = pending;
  pending = null;
  if (!value || now - value.at > TTL_MS) return null;
  const { at: _at, ...rest } = value;
  return rest;
}
