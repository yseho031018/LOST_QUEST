// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AuthPage from './AuthPage';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
const app=vi.hoisted(()=>({signup:vi.fn().mockResolvedValue(undefined),login:vi.fn().mockResolvedValue(undefined)}));
vi.mock('../context/AppContext',()=>({useApp:()=>({...app,isLoggedIn:false,profile:{name:'회원'},authUser:null})}));
let container:HTMLDivElement; let root:Root;
beforeEach(async()=>{
  app.signup.mockClear(); app.login.mockClear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  container=document.createElement('div'); document.body.appendChild(container); root=createRoot(container);
  await act(async()=>{root.render(<MemoryRouter initialEntries={['/signup']}><AuthPage/></MemoryRouter>);});
});
afterEach(()=>{act(()=>root.unmount());container.remove();vi.restoreAllMocks();});
async function enter(selector:string,value:string) {
  const input=container.querySelector<HTMLInputElement>(selector)!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value); input.dispatchEvent(new Event('input',{bubbles:true}));});
}
it('blocks da@ee in the signup form and shows the required address shape',async()=>{
  await enter('#auth-nickname','회원'); await enter('#auth-email','da@ee'); await enter('#auth-password','Quest1234!');
  await act(async()=>{container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  expect(app.signup).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('도메인과 확장자');
});
it('shows signup helper, password hint, and terms-styled consent links',()=>{
  expect(container.querySelector('.auth-signup-helper')?.textContent).toContain('필수만 입력하면 바로 가입할 수 있어요');
  expect(container.querySelector('.auth-password-hint')?.textContent).toContain('영문·숫자');
  const terms=container.querySelector<HTMLAnchorElement>('a.auth-policy-link[href="#terms"]');
  const privacy=container.querySelector<HTMLAnchorElement>('a.auth-policy-link[href="#privacy"]');
  expect(terms?.textContent).toBe('이용약관');
  expect(privacy?.textContent).toBe('개인정보 처리방침');
  expect(container.querySelector('.auth-agree-main')?.textContent).toContain('이메일과 닉네임 저장에 동의해요');
  expect(container.querySelector('.auth-agree-policies')).toBeTruthy();
});
it('submits a valid address after agreement',async()=>{
  await enter('#auth-nickname','회원'); await enter('#auth-email','hunter@gmail.com'); await enter('#auth-password','Quest1234!');
  await act(async()=>{container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();});
  await act(async()=>{container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  expect(app.signup).toHaveBeenCalledWith({email:'hunter@gmail.com',password:'Quest1234!',nickname:'회원'});
});
