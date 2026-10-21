import { apiRequest, ApiClientError } from './apiClient';
import { loadAuthSession } from './authSession';
import { validItemCoordinates, type ItemCoordinates } from './itemCoordinates';

export interface PlaceResult extends ItemCoordinates { id: string; name: string; address: string; region: string }

export async function searchRegistrationPlaces(query: string): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 2 || q.length > 100) throw new Error('장소 검색어를 2~100자로 입력해 주세요.');
  const data: unknown = await apiRequest('/api/places/search?q=' + encodeURIComponent(q), {
    accessToken: loadAuthSession()?.accessToken, timeoutMs: 9000,
  });
  if (!Array.isArray(data) || data.length > 5 || !data.every(p => p && typeof p.id === 'string' && typeof p.name === 'string'
    && p.name.length > 0 && p.name.length <= 200 && typeof p.address === 'string' && p.address.length <= 1000
    && typeof p.region === 'string' && validItemCoordinates(p.latitude, p.longitude))) {
    throw new ApiClientError('INVALID_RESPONSE', '검색 결과를 읽지 못했어요. 장소를 직접 입력해 주세요.');
  }
  return data;
}
