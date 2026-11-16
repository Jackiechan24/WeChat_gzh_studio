import {setIcon} from 'obsidian';
import {BUILTIN_STYLES} from './settings';
import {renderArticle} from './renderer';
const SAMPLE='## 文章的阅读节奏\n把重要的内容，讲得清楚。\n\n> 一句值得记住的话。\n\n### 内容层次\n- 先给结论\n- 再给方法\n\n```js\nconst article = render(note);\n```';
export function buildStylePicker(body:HTMLElement,ctx:{selectedId:string;choose:(id:string)=>Promise<void>}):()=>void {
  const doc=body.ownerDocument,grid=doc.createElement('div');grid.className='wx-preset-grid';body.append(grid);
  let disposed=false;
  const observer=new ResizeObserver(entries=>{for(const entry of entries){const canvas=entry.target.querySelector<HTMLElement>('.wx-preset-canvas');if(canvas)canvas.style.transform=`scale(${Math.max(.15,(entry.contentRect.width-16)/343)})`;}});
  const buttons:HTMLButtonElement[]=[];
  for(const profile of BUILTIN_STYLES){
    const button=doc.createElement('button');button.type='button';button.className='wx-preset-card';button.dataset.presetId=profile.id;
    button.setAttribute('aria-pressed', String(profile.id === ctx.selectedId));
    const thumb=doc.createElement('div');thumb.className='wx-preset-thumb';thumb.setAttribute('aria-hidden','true');
    const canvas=doc.createElement('div');canvas.className='wx-preset-canvas';thumb.append(canvas);button.append(thumb);
    const shadow=canvas.attachShadow({mode:'open'});
    void renderArticle(SAMPLE,{document:doc,sourcePath:'风格示例.md',settings:profile.settings,resolveImage:async()=>null}).then(result=>{
      if(disposed)return;const content=doc.createElement('div');content.innerHTML=result.previewHtml;shadow.append(content);
    });
    const meta=doc.createElement('div');meta.className='wx-preset-meta';const title=doc.createElement('strong');title.textContent=profile.name;title.id=`${body.parentElement?.id}-${profile.id}`;button.setAttribute('aria-labelledby',title.id);meta.append(title);
    if(profile.id===ctx.selectedId){const check=doc.createElement('span');check.className='wx-preset-check';setIcon(check,'check');meta.append(check);}
    const description=doc.createElement('p');description.textContent=profile.description||'';const use=doc.createElement('small');use.textContent=profile.useCase;button.append(meta,description,use);
    button.onclick=()=>{void ctx.choose(profile.id);};
    button.onkeydown=event=>{
      const i=buttons.indexOf(button);let next:number|undefined;
      if(event.key==='ArrowRight')next=(i+1)%buttons.length;else if(event.key==='ArrowLeft')next=(i+buttons.length-1)%buttons.length;else if(event.key==='ArrowDown')next=Math.min(buttons.length-1,i+2);else if(event.key==='ArrowUp')next=Math.max(0,i-2);else if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;
      if(next!==undefined){event.preventDefault();buttons[next].focus({ preventScroll: true });}
    };
    grid.append(button);buttons.push(button);observer.observe(thumb);
  }
  return()=>{disposed=true;observer.disconnect();};
}
