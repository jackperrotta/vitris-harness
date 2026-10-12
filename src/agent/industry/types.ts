import type {ThemeTokens} from '../../types.ts';
import type {CompareRole,ManifestPage} from '../theme-page-manifest.ts';

export type IndustryId=string;
export type OriginalIndustryId=
  |'real-estate-neighborhood'|'real-estate-residence'|'real-estate-property-desk'
  |'insurance-common-ground'|'insurance-risk-office'|'insurance-next-chapter'
  |'coaching-mainstage'|'coaching-practice-notes'|'coaching-workshop-house'
  |'care-everyday-company'|'care-care-coordination'|'care-independent-days';

export type IndustryPage=ManifestPage&{html:string};

export type ChromeCtx={
  page:IndustryPage;
  pages:IndustryPage[];
  href:(pageId:string)=>string;
  logoHtml:string;
  brandName:string;
  returnUrl?:string;
  main:string;
};

export type IndustrySite={
  id:IndustryId;
  name:string;
  business:string;
  audience:string;
  summary:string;
  industry:string;
  family:string;
  identities:[string,string]|[string,string,string];
  fonts:string[];
  tokens:ThemeTokens;
  css:string;
  image:string;
  geometry:string;
  responsive:string;
  principles:string[];
  pages:IndustryPage[];
  script?:string;
  renderBody:(ctx:ChromeCtx)=>string;
};

export type PageSeed={
  pageId:string;
  path:string;
  label:string;
  role:string;
  compareRole:CompareRole|null;
  group:string;
  featured?:boolean;
  previewPriority:number;
  html:string;
};

export function pages(seeds:PageSeed[]):IndustryPage[]{
  return seeds.map(seed=>({...seed,featured:seed.featured===true}));
}
