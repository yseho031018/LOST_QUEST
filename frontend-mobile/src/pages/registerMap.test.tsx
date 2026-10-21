// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import RegisterPage from './RegisterPage';
import { createServerItem } from '../services/itemApi';
import type { LocationSelection } from '../components/RegistrationLocationPicker';
vi.mock('../context/AppContext',()=>({useApp:()=>({isLoggedIn:true,logout:vi.fn()})}));
vi.mock('../context/MatchNotificationContext',()=>({useMatchNotifications:()=>({runRefresh:vi.fn()})}));
vi.mock('../services/itemApi',async original=>({...await original<typeof import('../services/itemApi')>(),createServerItem:vi.fn()}));
vi.mock('../components/RegistrationLocationPicker',()=>({ default:({selected,onConfirm,onClear}:{selected:LocationSelection|null;onConfirm:(p:LocationSelection)=>void;onClear:()=>void})=><div><button type="button" onClick={()=>onConfirm({location:'경기도 단대오거리역',region:'경기',latitude:37.44,longitude:127.15})}>위치 선택 테스트</button>{selected&&<button type="button" onClick={onClear}>선택 해제 테스트</button>}</div> }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root, container:HTMLDivElement;
beforeEach(()=>{ vi.clearAllMocks(); vi.spyOn(window,'scrollTo').mockImplementation(()=>{}); container=document.createElement('div');document.body.appendChild(container);root=createRoot(container); });
afterEach(()=>{act(()=>root.unmount());container.remove();vi.restoreAllMocks();});
async function render(type='lost'){await act(async()=>root.render(<MemoryRouter initialEntries={['/register?type='+type]}><RegisterPage/></MemoryRouter>));}
async function choose(){await act(async()=>{[...container.querySelectorAll('button')].find(b=>b.textContent==='위치 선택 테스트')!.click();});}
async function enter(id:string,value:string){await act(async()=>{const el=container.querySelector<HTMLInputElement|HTMLSelectElement>('#'+id)!;Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});}
async function submit(){await act(async()=>{container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});}
it.each(['lost','found'])('sends the confirmed coordinate pair in %s registration',async type=>{
 await render(type);await choose();expect(container.querySelector<HTMLInputElement>('#item-location')?.value).toBe('경기도 단대오거리역');expect(container.querySelector<HTMLSelectElement>('#item-region')?.value).toBe('경기');await submit();
 if(type==='found'){await enter('ownership-question','안쪽 색상은?');await enter('ownership-answer','파랑');}await submit();
 expect(createServerItem).toHaveBeenCalledWith(type,expect.objectContaining({location:'경기도 단대오거리역',region:'경기',latitude:37.44,longitude:127.15}),{image:null});
});
it.each(['item-location','item-region'])('clears stale coordinates when %s changes',async id=>{
 await render();await choose();await enter(id,id==='item-location'?'단대오거리역 2번 출구':'서울');expect(container.textContent).toContain('이전 지도 선택을 해제');await submit();await submit();
 expect(createServerItem).toHaveBeenCalledOnce();const input=vi.mocked(createServerItem).mock.calls[0][1];expect(input).not.toHaveProperty('latitude');expect(input).not.toHaveProperty('longitude');
});
