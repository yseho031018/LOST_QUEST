// Only explicit province/city names at the start of an address are evidence.
// Station names (서울숲역), cities (성남시), and landmarks are deliberately not inferred.
const regionAliases: Record<string, string> = {
  서울: '서울', 서울시: '서울', 서울특별시: '서울',
  부산: '부산', 부산시: '부산', 부산광역시: '부산',
  대구: '대구', 대구시: '대구', 대구광역시: '대구',
  인천: '인천', 인천시: '인천', 인천광역시: '인천',
  광주: '광주', 광주광역시: '광주',
  대전: '대전', 대전시: '대전', 대전광역시: '대전',
  울산: '울산', 울산시: '울산', 울산광역시: '울산',
  세종: '세종', 세종시: '세종', 세종특별자치시: '세종',
  경기: '경기', 경기도: '경기',
  강원: '강원', 강원도: '강원', 강원특별자치도: '강원',
  충북: '충북', 충청북도: '충북',
  충남: '충남', 충청남도: '충남',
  전북: '전북', 전라북도: '전북', 전북특별자치도: '전북',
  전남: '전남', 전라남도: '전남',
  경북: '경북', 경상북도: '경북',
  경남: '경남', 경상남도: '경남',
  제주: '제주', 제주도: '제주', 제주특별자치도: '제주',
};

const knownRegion = (name: string) => Object.hasOwn(regionAliases, name) ? regionAliases[name] : undefined;

export const normalizeRegistrationRegion = (name: string): string | undefined => knownRegion(name.trim());

export function hasRegistrationLocationMismatch(region: string, location: string): boolean {
  const selected = knownRegion(region);
  const tokens = location.trim().split(/\s+/);
  // Bare 광주 can also mean the city in 경기도; only 광주광역시 is unambiguous.
  const explicit = tokens[0] === '광주' ? undefined : knownRegion(tokens[0]);
  if (!selected || !explicit || selected === explicit) return false;
  // More than one province in the text may describe a boundary or a route.
  return !tokens.some(token => knownRegion(token) && knownRegion(token) !== explicit);
}
