import {CHECKPOINT,type Suite} from './theme-suites-checkpoint.ts';
import {INFORMATION_SUITES} from './theme-suites-information.ts';
import {SPATIAL_SUITES} from './theme-suites-spatial.ts';
import {GRAPHIC_SUITES} from './theme-suites-graphic.ts';
import {MATERIAL_SUITES} from './theme-suites-material.ts';
import {PRACTICE_SUITES} from './theme-suites-practice.ts';
import {LOCAL_SUITES} from './theme-suites-local.ts';
import {BUSINESSES,PAGE_ROLES} from './theme-suite-data.ts';
export const SUITES:Record<string,Suite>={...CHECKPOINT,...INFORMATION_SUITES,...SPATIAL_SUITES,...GRAPHIC_SUITES,...MATERIAL_SUITES,...PRACTICE_SUITES,...LOCAL_SUITES};
export function suite(id:string):Suite{const s=SUITES[id];if(!s)throw Error('This direction has no finished five-page suite: '+id);for(const role of PAGE_ROLES)if(!s[role]||!/<h1\b/.test(s[role]))throw Error('Incomplete page '+id+'/'+role);if(!BUSINESSES[id])throw Error('Missing demonstration business');return s;}
