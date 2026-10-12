import {cloudSites,cloudEntry} from '../theme-cloud.ts';
import {validateManifest} from '../theme-page-manifest.ts';
import type {IndustrySite} from './types.ts';
import {neighborhood} from './sites/neighborhood.ts';
import {residence} from './sites/residence.ts';
import {propertyDesk} from './sites/property-desk.ts';
import {commonGround} from './sites/common-ground.ts';
import {riskOffice} from './sites/risk-office.ts';
import {nextChapter} from './sites/next-chapter.ts';
import {mainstage} from './sites/mainstage.ts';
import {practiceNotes} from './sites/practice-notes.ts';
import {workshopHouse} from './sites/workshop.ts';
import {everyday} from './sites/everyday.ts';
import {coordination} from './sites/coordination.ts';
import {independentDays} from './sites/independent.ts';
import {SEVEN_SITES} from './seven/registry.ts';
import {RIDGELINE} from './ridgeline/site.ts';

export const INDUSTRY_SITES:Record<string,IndustrySite>={
 ...cloudSites(),
 ...SEVEN_SITES,
 [RIDGELINE.id]:RIDGELINE,
 [neighborhood.id]:neighborhood,
 [residence.id]:residence,
 [propertyDesk.id]:propertyDesk,
 [commonGround.id]:commonGround,
 [riskOffice.id]:riskOffice,
 [nextChapter.id]:nextChapter,
 [mainstage.id]:mainstage,
 [practiceNotes.id]:practiceNotes,
 [workshopHouse.id]:workshopHouse,
 [everyday.id]:everyday,
 [coordination.id]:coordination,
 [independentDays.id]:independentDays
};

for(const site of Object.values(INDUSTRY_SITES)){
 validateManifest(site.id,site.pages);
 if(cloudEntry(site.id))continue;
 const ids=new Set(site.pages.map(p=>p.pageId));
 for(const page of site.pages){
  if(!/<h1[\s>]/.test(page.html))throw Error('Missing h1 '+site.id+'/'+page.pageId);
  for(const match of page.html.matchAll(/href="@([a-z0-9-]+)"/g))if(!ids.has(match[1]!))throw Error('Dangling link '+site.id+' '+page.pageId+' @'+match[1]);
 }
}
