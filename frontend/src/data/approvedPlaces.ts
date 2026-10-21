import type { Item } from '../types';

/** A reviewed map position for one post: the representative place it was taken from (OpenStreetMap). */
export interface ApprovedPlace {
  lat: number;
  lng: number;
  /** The station, terminal or landmark the marker stands for. */
  label: string;
}

interface ApprovedEntry extends ApprovedPlace {
  /** The exact location text stored for the post when its position was approved. */
  location: string;
}

/**
 * Positions approved by hand on 2026-10-21 for the public expo posts (OpenStreetMap / Nominatim lookups).
 * Keyed by route id, which includes the post type (api-lost-64 / api-found-30). Posts that are not listed, or whose
 * stored location text changed since, get no map: no position is ever guessed.
 * Left out on purpose: lost 65 (likely the register form default), found 31 and 56 (no specific stop),
 * found 40 (two 신촌 stations), found 44 (station not found on OpenStreetMap).
 */
const APPROVED: Record<string, ApprovedEntry> = {
  'api-lost-64': { location: '송파구 잠실역 근처', label: '잠실역', lat: 37.51322, lng: 127.10014 },
  'api-found-30': { location: '성남시 단대오거리역 2번 출구 앞', label: '단대오거리역', lat: 37.44508, lng: 127.15678 },
  'api-found-32': { location: '성남시 모란역 대합실', label: '모란역', lat: 37.43222, lng: 127.12908 },
  'api-found-33': { location: '송파구 잠실역 8번 출구', label: '잠실역', lat: 37.51322, lng: 127.10014 },
  'api-found-34': { location: '성남시 신흥역 근처 편의점', label: '신흥역', lat: 37.441, lng: 127.14766 },
  'api-found-35': { location: '성남시 단대오거리 버스정류장', label: '단대오거리역', lat: 37.44508, lng: 127.15678 },
  'api-found-36': { location: '강남구 코엑스 2층 휴게실', label: '코엑스', lat: 37.51187, lng: 127.05911 },
  'api-found-37': { location: '강남역 2번 출구 앞 벤치', label: '강남역', lat: 37.49795, lng: 127.02756 },
  'api-found-38': { location: '서울숲역 개찰구 근처', label: '서울숲역', lat: 37.54359, lng: 127.04474 },
  'api-found-39': { location: '성수역 3번 출구 계단', label: '성수역', lat: 37.54457, lng: 127.0561 },
  'api-found-41': { location: '홍대입구역 9번 출구', label: '홍대입구역', lat: 37.55663, lng: 126.92351 },
  'api-found-42': { location: '합정역 대합실', label: '합정역', lat: 37.54936, lng: 126.91366 },
  'api-found-43': { location: '인천종합버스터미널 대기실', label: '인천종합터미널', lat: 37.44111, lng: 126.70157 },
  'api-found-45': { location: '서면역 7번 출구 근처', label: '서면역', lat: 35.15819, lng: 129.05945 },
  'api-found-46': { location: '부산역 맞이방', label: '부산역', lat: 35.11555, lng: 129.04259 },
  'api-found-47': { location: '청주 시외버스터미널 대합실', label: '청주시외버스터미널', lat: 36.62527, lng: 127.4316 },
  'api-found-49': { location: '사직야구장 3루 출입구 앞', label: '사직야구장', lat: 35.19419, lng: 129.06148 },
  'api-found-50': { location: '대전역 대합실 의자 옆', label: '대전역', lat: 36.33135, lng: 127.43336 },
  'api-found-51': { location: '해운대역 1번 출구 근처', label: '해운대역', lat: 35.16375, lng: 129.15875 },
  'api-found-52': { location: '잠실역 지하 주차장 입구', label: '잠실역', lat: 37.51322, lng: 127.10014 },
  'api-found-53': { location: '종로3가역 5번 출구 계단', label: '종로3가역', lat: 37.57044, lng: 126.99232 },
  'api-found-54': { location: '여의도 한강공원 화장실 세면대', label: '여의도한강공원', lat: 37.52567, lng: 126.93606 },
  'api-found-55': { location: '유성온천역 2번 출구 벤치', label: '유성온천역', lat: 36.3537, lng: 127.34165 },
  'api-found-57': { location: '둔산동 시청역 3번 출구', label: '대전 시청역', lat: 36.35148, lng: 127.38663 },
};

/** The approved position only when the post's type, id and stored location text all match the reviewed entry. */
export function findApprovedPlace(item: Pick<Item, 'id' | 'type' | 'source' | 'location'>): ApprovedPlace | null {
  if (item.source !== 'community' || !item.id.startsWith(`api-${item.type}-`)) return null;
  const entry = Object.prototype.hasOwnProperty.call(APPROVED, item.id) ? APPROVED[item.id] : undefined;
  if (!entry || entry.location !== item.location.trim()) return null;
  return { lat: entry.lat, lng: entry.lng, label: entry.label };
}

/** Kakao Map search for the stored place text (no key needed); used whenever no map is shown. */
export function kakaoMapSearchUrl(place: string): string {
  return `https://map.kakao.com/link/search/${encodeURIComponent(place)}`;
}
