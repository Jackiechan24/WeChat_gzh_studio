import {setIcon} from 'obsidian';
export function buildFooterEditor(panel:HTMLElement,ctx:{value:string;override:boolean;article:boolean;input:(value:string)=>void;flush:()=>Promise<void>;close:()=>void;setCommon:()=>Promise<void>;restore:()=>Promise<void>}):HTMLElement {
 const doc=panel.ownerDocument;
 const head=doc.createElement('div');head.className='wx-picker-head';const intro=doc.createElement('div');const title=doc.createElement('strong');title.textContent='固定结尾';const hint=doc.createElement('p');hint.textContent='署名、关注语等，支持 Markdown。留空即可不添加。';intro.append(title,hint);head.append(intro);
 const close = doc.createElement('button');
 close.className = 'wx-icon-button';
 setIcon(close, 'x');
 const closeLabel = doc.createElement('span');
 closeLabel.className = 'wx-visually-hidden';
 closeLabel.textContent = '关闭固定结尾';
 close.append(closeLabel);
 close.onclick = ctx.close;
 head.append(close);
 panel.append(head);
 const scope=doc.createElement('p');scope.className='wx-footer-scope';scope.textContent=!ctx.article?'常用结尾':ctx.override?'此文结尾 · 修改后自动保存':'沿用常用结尾 · 修改仅用于此文';panel.append(scope);
 const input=doc.createElement('textarea');input.rows=6;input.value=ctx.value;input.placeholder='例如：感谢阅读，欢迎关注。';input.setAttribute('aria-label','固定结尾内容');input.className='wx-footer-input';input.oninput=()=>ctx.input(input.value);input.onchange=()=>{void ctx.flush();};panel.append(input);
 const status=doc.createElement('div');status.className='wx-footer-save-state';status.setAttribute('role','status');status.textContent='修改会自动保存，并随正文一起复制';panel.append(status);
 const actions=doc.createElement('div');actions.className='wx-footer-actions';
 const common=doc.createElement('button');common.textContent='设为常用结尾';common.onclick=()=>{void ctx.setCommon();};if(ctx.article)actions.append(common);
 if(ctx.article){const reset=doc.createElement('button');reset.textContent='恢复常用';reset.dataset.footerRestore='true';reset.disabled=!ctx.override;reset.onclick=()=>{void ctx.restore();};actions.append(reset);}
 panel.append(actions);return status;
}
