import { expect, it } from 'vitest';
import { hasRegistrationLocationMismatch } from './registrationLocation';

it.each([
  ['경북', '서울 성동구 서울숲역', true],
  ['경북', '서울특별시 성동구 서울숲역', true],
  ['경북', '서울시 성동구 서울숲역', true],
  ['서울', '서울 성동구 서울숲역', false],
  ['서울', '서울특별시 성동구 서울숲역', false],
  ['경북', '경상북도 포항시 역 앞', false],
  ['서울', '부산광역시 부산역', true],
  ['경기', '경기도 성남시', false],
  ['서울', '경기도 성남시', true],
  ['강원', '강원특별자치도 춘천시', false],
  ['강원', '강원도 춘천시', false],
  ['전북', '전북특별자치도 전주시', false],
  ['전북', '전라북도 전주시', false],
  ['제주', '제주특별자치도 제주시', false],
  ['경북', '단대오거리역', false],
  ['경북', '서울숲역', false],
  ['경북', '서울대입구역', false],
  ['경북', '서울역', false],
  ['경북', '성남시 단대오거리역 2번 출구 앞', false],
  ['서울', '경남아파트 앞', false],
  ['경기', '광주 경안동', false],
  ['경기', '광주시 경안동', false],
  ['경기', '광주광역시 북구', true],
  ['경북', '서울 경기 경계', false],
  ['경북', '서울/경기 경계', false],
  ['경북', '장소: 서울 성동구', false],
  ['경북', '  서울\n성동구 서울숲역  ', true],
  ['경북', '', false],
  ['경북', '   ', false],
  ['알 수 없음', '서울 성동구', false],
  ['경북', 'constructor', false],
])('compares only unambiguous province tokens: %s / %s → %s', (region, place, expected) => {
  expect(hasRegistrationLocationMismatch(region, place)).toBe(expected);
});
