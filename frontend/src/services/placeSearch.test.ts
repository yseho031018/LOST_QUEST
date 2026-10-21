import { afterEach, expect, it, vi } from 'vitest';
import { searchRegistrationPlaces } from './placeSearch';
import { apiRequest } from './apiClient';
vi.mock('./apiClient',async original=>({...await original<typeof import('./apiClient')>(),apiRequest:vi.fn()}));
vi.mock('./authSession',()=>({loadAuthSession:()=>({accessToken:'token'})}));
afterEach(()=>vi.clearAllMocks());
it('encodes a user-triggered query and uses the existing authenticated API client',async()=>{
 const data=[{id:'42',name:'서울숲역',address:'서울 성동구 서울숲역',region:'서울특별시',latitude:37.54,longitude:127.04}];vi.mocked(apiRequest).mockResolvedValue(data);
 expect(await searchRegistrationPlaces(' 서울숲역 ')).toEqual(data);expect(apiRequest).toHaveBeenCalledWith('/api/places/search?q='+encodeURIComponent('서울숲역'),{accessToken:'token',timeoutMs:9000});
});
it.each(['','a','x'.repeat(101)])('rejects invalid query without any request: %s',async query=>{await expect(searchRegistrationPlaces(query)).rejects.toThrow('2~100');expect(apiRequest).not.toHaveBeenCalled();});
it.each([{},'<html>',[{id:'1',name:'서울숲역',address:'서울',region:'서울',latitude:91,longitude:127}]])('rejects malformed or unsafe place responses',async value=>{vi.mocked(apiRequest).mockResolvedValue(value);await expect(searchRegistrationPlaces('서울숲역')).rejects.toThrow('검색 결과를 읽지');});
