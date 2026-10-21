/**
 * Title → object family, the same conservative rules as the server's ItemKind (matching): a title naming two
 * different families, or none, stays unknown rather than guessed. Ids match the photo classifier's ITEM_TYPES.
 */
const WORDS: Record<string, string> = {
  umbrella: '우산|우양산|양산|umbrella',
  clothes: '후드집업|후드티|후드|집업|재킷|자켓|점퍼|코트|패딩|티셔츠|셔츠|가디건|스웨터|니트|바지|치마|원피스|의류|hoodie|jacket|coat|shirt',
  wallet: '지갑|반지갑|장지갑|wallet|purse',
  bag: '가방|백팩|핸드백|에코백|여행가방|캐리어|backpack|handbag|suitcase',
  phone: '휴대폰|스마트폰|핸드폰|아이폰|갤럭시폰|smartphone|iphone',
  earbuds: '이어폰|에어팟|갤럭시버즈|earbuds|airpods',
  headphones: '헤드폰|헤드셋|headphones|headset',
  laptop: '노트북|맥북|laptop|macbook',
  tablet: '태블릿|타블렛|아이패드|갤럭시탭|ipad|tablet',
  keys: '열쇠|스마트키|차키|키링|keyring',
  glasses: '안경|선글라스|sunglasses|eyeglasses',
  watch: '손목시계|스마트워치|애플워치|시계|wristwatch',
  camera: '카메라|디지털카메라|camera',
  bottle: '물병|텀블러|보온병|bottle|tumbler',
  book: '노트|수첩|도서|책|notebook|book',
  shoes: '운동화|구두|신발|스니커즈|shoes|sneakers',
  hat: '모자|야구모자|비니|hat',
  card: '신분증|주민등록증|면허증|카드|card',
  jewelry: '반지|목걸이|팔찌|귀걸이|장신구|jewelry',
  fishing: '낚싯대|낚시대|낚시가방|낚시용품|낚시|fishing',
  golf: '골프채|골프클럽|골프백|골프공|골프|golf',
};
/** Families this rule set can read from titles; the photo search offers only these. */
export const TITLE_KINDS = Object.keys(WORDS);
const ALIASES = new Map<string, string>();
for (const [kind, words] of Object.entries(WORDS)) for (const word of words.split('|')) ALIASES.set(word, kind);
const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Longer words first so 노트북 never also matches 노트 and 손목시계 is not counted as 시계 twice.
const PATTERN = new RegExp([...ALIASES.keys()]
  .sort((a, b) => b.length - a.length || a.localeCompare(b))
  .map(word => /^[a-z]+$/.test(word) ? `(?<![a-z])${escape(word)}(?![a-z])` : escape(word))
  .join('|'), 'g');

function kinds(value: string | undefined): Set<string> {
  const found = new Set<string>();
  for (const match of (value ?? '').toLowerCase().matchAll(PATTERN)) found.add(ALIASES.get(match[0])!);
  return found;
}

export function itemKindOf(title: string | undefined, category?: string): string | null {
  const fromTitle = kinds(title);
  if (fromTitle.size > 1) return null; // e.g. "우산이 든 가방": do not guess the main object.
  if (fromTitle.size === 1) return [...fromTitle][0];
  const fromCategory = kinds(category);
  return fromCategory.size === 1 ? [...fromCategory][0] : null;
}
