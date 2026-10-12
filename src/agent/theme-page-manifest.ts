import {PAGE_ROLES,pageLabels,type PageRole} from './theme-suite-data.ts';

/** Semantic buckets for comparison. A role may repeat; pageId is the stable key. */
export type CompareRole='home'|'browse'|'detail'|'trust'|'conversion';
export const COMPARE_ROLES:readonly CompareRole[]=['home','browse','detail','trust','conversion'];
export const MANIFEST_VERSION=2 as const;

export type ManifestPage={
  pageId:string;
  path:string;
  label:string;
  /** Legacy suites keep the five PageRole values. Industry pages use a semantic role that may repeat. */
  role:string;
  compareRole:CompareRole|null;
  group:string;
  featured:boolean;
  previewPriority:number;
  /** Current industry pages pin content and referenced media; frozen adapters stay unchanged. */
  contentIdentity?:string;
  assetIdentity?:string;
};

const LEGACY_COMPARE:Record<PageRole,CompareRole>={home:'home',services:'browse','service-detail':'detail',about:'trust',contact:'conversion'};

export function legacyManifest(id:string):ManifestPage[]{
  return PAGE_ROLES.map((role,index)=>({
    pageId:role,
    path:role==='home'?'/':'/'+role,
    label:pageLabels(id)[role],
    role,
    compareRole:LEGACY_COMPARE[role],
    group:'Site',
    featured:true,
    previewPriority:index
  }));
}

export function validateManifest(id:string,pages:readonly ManifestPage[]):void{
  if(pages.length<1)throw Error('Empty page manifest '+id);
  const ids=new Set<string>(),paths=new Set<string>();
  let homes=0;
  for(const page of pages){
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.pageId))throw Error('Unstable page id '+id+'/'+page.pageId);
    if(ids.has(page.pageId))throw Error('Duplicate page id '+page.pageId);
    ids.add(page.pageId);
    const path=normalizePath(page.path);
    if(path!==page.path)throw Error('Unnormalized path '+page.path);
    if(paths.has(path))throw Error('Duplicate path '+path);
    paths.add(path);
    if(!page.label.trim())throw Error('Missing label '+page.pageId);
    if(page.compareRole==='home'||page.role==='home')homes++;
    if(page.compareRole&&!COMPARE_ROLES.includes(page.compareRole))throw Error('Unknown compare role '+page.compareRole);
  }
  if(homes!==1)throw Error('Manifest '+id+' needs exactly one home');
  for(const page of pages){
    if(page.featured&&pages.filter(p=>p.featured).length>5&&pages.filter(p=>p.featured&&p.previewPriority<=page.previewPriority).length>5){
      /* featured may exceed five; gallery slices by priority */
    }
  }
}

export function normalizePath(path:string):string{
  if(path==='/')return '/';
  const clean=path.trim();
  if(!clean.startsWith('/')||clean.endsWith('/')||clean.includes('//')||clean.includes('..'))throw Error('Invalid route '+path);
  return clean;
}

export function pageById(pages:readonly ManifestPage[],pageId:string):ManifestPage|undefined{
  return pages.find(p=>p.pageId===pageId);
}

/** story/guide remain explicit specimen aliases. Unknown ids are not remapped to home. */
export function resolvePageKey(pages:readonly ManifestPage[],key:string):ManifestPage|undefined{
  const exact=pageById(pages,key);
  if(exact)return exact;
  if(key==='story')return pages.find(p=>p.compareRole==='home'||p.role==='home');
  if(key==='guide')return pages.find(p=>p.pageId==='service-detail')||pages.find(p=>p.compareRole==='detail');
  return undefined;
}

export function comparePage(pages:readonly ManifestPage[],role:CompareRole):ManifestPage|undefined{
  return pages.find(p=>p.compareRole===role);
}

export function featuredPages(pages:readonly ManifestPage[],limit=5):ManifestPage[]{
  return [...pages].filter(p=>p.featured).sort((a,b)=>a.previewPriority-b.previewPriority).slice(0,limit);
}
