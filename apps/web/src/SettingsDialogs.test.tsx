import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {InstallDialog} from './SettingsDialogs';
vi.mock('./Dialog',()=>({Dialog:({children}:{children:React.ReactNode})=><div>{children}</div>}));
it('never asks for manual installation confirmation and translates the fallback',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);localStorage.setItem('dn_language','ar');
 const host=document.createElement('div'),root=createRoot(host);
 try {
  await act(async()=>root.render(<InstallDialog status="unavailable" onInstalled={()=>{}} onClose={()=>{}}/>));
  expect(host.querySelectorAll('button')).toHaveLength(1);
  expect(host.textContent).not.toContain('Open your browser');
  expect(host.textContent).not.toContain('مثبّت بالفعل على هذا الجهاز');
  expect(host.querySelector('[role="status"]')?.textContent).toContain('لا يمكن لهذا المتصفح');
 }finally{await act(async()=>root.unmount());localStorage.clear();vi.unstubAllGlobals();}
});
