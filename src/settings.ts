export const THEMES = {
  jade: { name: '青玉', accent: '#087f72', soft: '#edf8f5', text: '#263c38' },
  blue: { name: '靛蓝', accent: '#315acb', soft: '#eef3ff', text: '#293449' },
  ink: { name: '墨色', accent: '#30363e', soft: '#f1f3f5', text: '#30363e' },
  amber: { name: '暖橙', accent: '#b45309', soft: '#fff6e8', text: '#45382d' }
} as const;
export const CHAPTERS = { line: '左侧竖线', underline: '粗下划线', number: '序号章节', simple: '简洁标题', soft: '浅底标题', outline: '细框标题' } as const;
export type Composition = 'classic'|'reading'|'editorial'|'cards'|'journal'|'technical'|'bulletin'|'apple';
export interface LayoutSettings {
  composition:Composition;
  theme: keyof typeof THEMES; chapter: keyof typeof CHAPTERS;
  fontSize: number; lineHeight: number; paragraphGap: number;
  font: 'sans' | 'serif' | 'kai'; textColor: string; accentColor: string;
  letterSpacing: number; textAlign: 'left' | 'justify'; paragraphIndent: boolean; contentInset: number; fontWeight: 400 | 500;
  headingScale: 'compact' | 'balanced' | 'large'; headingColor: 'body' | 'accent'; headingAlign: 'left' | 'center'; headingWeight: 600 | 700;
  chapterGap: number; subheadingGap: number; headingAfterGap: number; h3Style: 'plain' | 'line' | 'underline';
  strongStyle: 'bold' | 'accent' | 'underline'; highlightStyle: 'soft' | 'marker' | 'underline'; linkStyle: 'underline' | 'subtle' | 'plain';
  imageRadius: number; imageGap: number; imageMaxWidth: number; imageAlign: 'left' | 'center'; imageFrame: 'none' | 'border' | 'card';
  listStyle: 'dot' | 'dash' | 'square'; orderedStyle: 'decimal' | 'paren' | 'circle'; listGap: number; listIndent: number;
  quoteStyle: 'soft' | 'line' | 'card'; tableStyle: 'grid' | 'striped' | 'minimal'; codeTheme: 'light' | 'dark'; codeFontSize: number;
  dividerStyle: 'line' | 'dashed' | 'dots';
  hideTitle: boolean; numberChapters: boolean; footer: string;
}
export const DEFAULTS: LayoutSettings = {
  composition:'classic',theme:'jade',chapter:'line',fontSize:16,lineHeight:1.9,paragraphGap:18,font:'sans',textColor:'',accentColor:'',
  letterSpacing:0.2,textAlign:'left',paragraphIndent:false,contentInset:0,fontWeight:400,
  headingScale:'balanced',headingColor:'body',headingAlign:'left',headingWeight:700,chapterGap:32,subheadingGap:24,headingAfterGap:14,h3Style:'plain',
  strongStyle:'bold',highlightStyle:'soft',linkStyle:'underline',
  imageRadius:0,imageGap:20,imageMaxWidth:100,imageAlign:'center',imageFrame:'none',
  listStyle:'dot',orderedStyle:'decimal',listGap:8,listIndent:22,quoteStyle:'soft',tableStyle:'grid',codeTheme:'light',codeFontSize:13,dividerStyle:'line',
  hideTitle:true,numberChapters:true,footer:''
};
export function normalizeSettings(value: Partial<LayoutSettings> = {}): LayoutSettings {
  const s={...DEFAULTS,...value};
  const clamp=(n:unknown,lo:number,hi:number,fallback:number)=>typeof n==='number'&&Number.isFinite(n)?Math.min(hi,Math.max(lo,n)):fallback;
  const pick=<T extends string>(v:unknown,choices:readonly T[],fallback:T):T=>choices.includes(v as T)?v as T:fallback;
  const hex=(v:unknown)=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v:'';
  return {
    composition:pick(s.composition,['classic','reading','editorial','cards','journal','technical','bulletin','apple'],'classic'),
    theme:pick(s.theme,Object.keys(THEMES) as (keyof typeof THEMES)[],'jade'),chapter:pick(s.chapter,Object.keys(CHAPTERS) as (keyof typeof CHAPTERS)[],'line'),
    fontSize:clamp(s.fontSize,12,24,16),lineHeight:clamp(s.lineHeight,1.3,2.6,1.9),paragraphGap:clamp(s.paragraphGap,6,36,18),
    font:pick(s.font,['sans','serif','kai'],'sans'),textColor:hex(s.textColor),accentColor:hex(s.accentColor),
    letterSpacing:clamp(s.letterSpacing,0,2,0.2),textAlign:pick(s.textAlign,['left','justify'],'left'),paragraphIndent:s.paragraphIndent===true,contentInset:clamp(s.contentInset,0,24,0),fontWeight:s.fontWeight===500?500:400,
    headingScale:pick(s.headingScale,['compact','balanced','large'],'balanced'),headingColor:pick(s.headingColor,['body','accent'],'body'),headingAlign:pick(s.headingAlign,['left','center'],'left'),headingWeight:s.headingWeight===600?600:700,
    chapterGap:clamp(s.chapterGap,16,64,32),subheadingGap:clamp(s.subheadingGap,12,40,24),headingAfterGap:clamp(s.headingAfterGap,6,24,14),h3Style:pick(s.h3Style,['plain','line','underline'],'plain'),
    strongStyle:pick(s.strongStyle,['bold','accent','underline'],'bold'),highlightStyle:pick(s.highlightStyle,['soft','marker','underline'],'soft'),linkStyle:pick(s.linkStyle,['underline','subtle','plain'],'underline'),
    imageRadius:clamp(s.imageRadius,0,20,0),imageGap:clamp(s.imageGap,0,40,20),imageMaxWidth:clamp(s.imageMaxWidth,40,100,100),imageAlign:pick(s.imageAlign,['left','center'],'center'),imageFrame:pick(s.imageFrame,['none','border','card'],'none'),
    listStyle:pick(s.listStyle,['dot','dash','square'],'dot'),orderedStyle:pick(s.orderedStyle,['decimal','paren','circle'],'decimal'),listGap:clamp(s.listGap,0,20,8),listIndent:clamp(s.listIndent,16,36,22),
    quoteStyle:pick(s.quoteStyle,['soft','line','card'],'soft'),tableStyle:pick(s.tableStyle,['grid','striped','minimal'],'grid'),codeTheme:pick(s.codeTheme,['light','dark'],'light'),codeFontSize:clamp(s.codeFontSize,11,18,13),dividerStyle:pick(s.dividerStyle,['line','dashed','dots'],'line'),
    hideTitle:s.hideTitle!==false,numberChapters:s.numberChapters!==false,footer:typeof s.footer==='string'?s.footer:''
  };
}
export function getArticleColors(s: LayoutSettings) {
  const theme=THEMES[s.theme];
  if(!s.accentColor)return theme;
  const blend=(amount:number)=>'#'+[1,3,5].map(i=>Math.round(parseInt(s.accentColor.slice(i,i+2),16)*(1-amount)+255*amount).toString(16).padStart(2,'0')).join('');
  return {...theme,accent:s.accentColor,soft:blend(0.93)};
}
export const STYLE_KEYS = [
  'composition','theme','chapter','fontSize','lineHeight','paragraphGap','font','textColor','accentColor','letterSpacing','textAlign','paragraphIndent','contentInset','fontWeight',
  'headingScale','headingColor','headingAlign','headingWeight','chapterGap','subheadingGap','headingAfterGap','h3Style','strongStyle','highlightStyle','linkStyle',
  'imageRadius','imageGap','imageMaxWidth','imageAlign','imageFrame','listStyle','orderedStyle','listGap','listIndent','quoteStyle','tableStyle','codeTheme','codeFontSize','dividerStyle'
] as const satisfies readonly (keyof LayoutSettings)[];
export type StyleSettings=Pick<LayoutSettings,typeof STYLE_KEYS[number]>;
export interface StyleProfile { id:string; name:string; description?:string; settings:StyleSettings }
export type PreviewMode = 'mobile' | 'pad';
export interface PluginData {
  defaultStyleId:string;articleStyleIds:Record<string,string>;
  previewMode:PreviewMode;defaults:LayoutSettings;articles:Record<string,Partial<LayoutSettings>>;imageUrls:Record<string,string>;savedStyles:StyleProfile[];
}
export function getStyleSettings(s:LayoutSettings):StyleSettings {return Object.fromEntries(STYLE_KEYS.map(key=>[key,s[key]])) as StyleSettings;}
export interface LayoutPreset extends StyleProfile { settings:LayoutSettings; useCase:string }
const preset=(id:string,name:string,description:string,useCase:string,patch:Partial<LayoutSettings>):LayoutPreset=>({id,name,description,useCase,settings:normalizeSettings({...DEFAULTS,fontSize:16,lineHeight:1.75,contentInset:12,...patch})});
export const BUILTIN_STYLES:LayoutPreset[]=[
  preset('reader','清爽阅读','白底青绿 · 轻章节 · 舒展留白','日常文章 / 观点分享',{composition:'reading',numberChapters:false,paragraphGap:20,chapter:'line',headingScale:'balanced',headingColor:'body',imageRadius:0,quoteStyle:'line'}),
  preset('magazine','黑白杂志','大序号 · 居中衬线 · 黑白双线','专栏长文 / 深度观点',{composition:'editorial',theme:'ink',textColor:'#222222',accentColor:'#191919',font:'serif',paragraphGap:24,letterSpacing:0.5,chapter:'number',headingScale:'large',headingAlign:'center',chapterGap:48,subheadingGap:30,headingAfterGap:22,strongStyle:'underline',quoteStyle:'line',tableStyle:'minimal',numberChapters:true,imageGap:28}),
  preset('cards','知识卡片','浅底白卡 · 蓝色章头 · 分组信息','知识教程 / 方法清单',{composition:'cards',contentInset:8,theme:'blue',accentColor:'#2458ab',paragraphGap:14,letterSpacing:0.1,chapter:'soft',headingScale:'balanced',headingColor:'accent',chapterGap:20,subheadingGap:20,headingAfterGap:16,h3Style:'line',strongStyle:'accent',highlightStyle:'marker',quoteStyle:'soft',listStyle:'square',orderedStyle:'circle',listGap:9,tableStyle:'striped',imageRadius:6,imageGap:18,numberChapters:true}),
  preset('apple','苹果极简','黑灰层次 · 舒展留白 · 柔白图块','产品介绍 / 灵感分享',{composition:'apple',theme:'ink',accentColor:'#0071e3',textColor:'#6e6e73',font:'sans',paragraphGap:24,letterSpacing:0,paragraphIndent:false,chapter:'simple',headingScale:'large',headingWeight:600,headingColor:'body',chapterGap:52,subheadingGap:32,headingAfterGap:22,h3Style:'plain',strongStyle:'bold',highlightStyle:'soft',quoteStyle:'card',imageFrame:'card',imageRadius:12,imageGap:28,listStyle:'dot',tableStyle:'minimal',dividerStyle:'line',numberChapters:false}),
  preset('technical','技术文档','深色章头 · 紧凑步骤 · 暗色代码','技术笔记 / 操作指南',{composition:'technical',theme:'blue',accentColor:'#22638d',textColor:'#263445',paragraphGap:14,letterSpacing:0,chapter:'line',headingScale:'balanced',chapterGap:28,subheadingGap:22,headingAfterGap:16,h3Style:'underline',listGap:6,orderedStyle:'paren',quoteStyle:'line',tableStyle:'striped',codeTheme:'dark',codeFontSize:13,imageFrame:'border',imageRadius:0,imageGap:18,numberChapters:true}),
  preset('bulletin','红黑简报','红色章号 · 黑白正文 · 利落层次','工作简报 / 观点清单',{composition:'bulletin',theme:'ink',accentColor:'#b22d35',textColor:'#292b30',paragraphGap:16,letterSpacing:0.1,chapter:'simple',headingScale:'balanced',chapterGap:32,subheadingGap:24,headingAfterGap:16,h3Style:'plain',strongStyle:'accent',highlightStyle:'underline',quoteStyle:'soft',listStyle:'square',orderedStyle:'paren',listGap:7,tableStyle:'minimal',imageFrame:'border',imageGap:20,dividerStyle:'line',numberChapters:true})
];
export function getPreset(id:unknown):LayoutPreset {
  const alias:Record<string,string>={business:'cards',essay:'apple',warm:'apple'};
  const key=typeof id==='string'?(alias[id]||id):'reader';
  return BUILTIN_STYLES.find(p=>p.id===key)||BUILTIN_STYLES[0];
}
export function inferStyleId(raw:Partial<LayoutSettings>={}):string {
  const s=normalizeSettings(raw);
  if(s.composition!=='classic')return ({reading:'reader',bulletin:'bulletin',editorial:'magazine',cards:'cards',journal:'apple',apple:'apple',technical:'technical'} as Record<string,string>)[s.composition]||'reader';
  if(s.codeTheme==='dark')return 'technical';
  if(s.theme==='ink')return 'magazine';
  if(s.theme==='amber'||s.font==='kai')return 'apple';
  if(s.theme==='blue')return 'cards';
  return 'reader';
}
export function migrateStyleSelection(stored:Partial<PluginData>={}):Pick<PluginData,'defaultStyleId'|'articleStyleIds'> {
  const defaultStyleId=typeof stored.defaultStyleId==='string'?getPreset(stored.defaultStyleId).id:inferStyleId(stored.defaults);
  const articleStyleIds:Record<string,string>={};
  for(const [path,settings]of Object.entries(stored.articles||{}))if(settings&&typeof settings==='object')articleStyleIds[path]=inferStyleId({...stored.defaults,...settings});
  for(const [path,id]of Object.entries(stored.articleStyleIds||{}))if(typeof id==='string')articleStyleIds[path]=getPreset(id).id;
  return {defaultStyleId,articleStyleIds};
}
export function presetSettingsFor(data:PluginData,path=''):LayoutSettings {
  const content=normalizeSettings({...data.defaults,...data.articles[path]});
  // Visual choices come exclusively from the complete preset. Keep content rules.
  return {...getPreset(data.articleStyleIds[path]||data.defaultStyleId).settings,footer:content.footer,hideTitle:content.hideTitle};
}
export function normalizeStyleProfiles(value:unknown):StyleProfile[]{
  if(!Array.isArray(value))return[];
  const ids=new Set<string>();const result:StyleProfile[]=[];
  for(const item of value){
    if(!item||typeof item!=='object'||typeof item.id!=='string'||!/^user-[a-z0-9-]+$/i.test(item.id)||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||!item.settings||typeof item.settings!=='object')continue;
    ids.add(item.id);result.push({id:item.id,name:item.name.trim().slice(0,24),settings:getStyleSettings(normalizeSettings(item.settings))});
  }
  return result.slice(0,50);
}
export function sameStyle(s:LayoutSettings,profile:StyleProfile):boolean{return STYLE_KEYS.every(key=>s[key]===profile.settings[key]);}
export function activeStyle(s:LayoutSettings,saved:StyleProfile[]=[]):StyleProfile|undefined{return [...saved,...BUILTIN_STYLES].find(p=>sameStyle(s,p));}
export function applyStyleSettings(current:LayoutSettings,profile:StyleProfile):LayoutSettings{return normalizeSettings({...current,...getStyleSettings(normalizeSettings(profile.settings))});}
