import themes from './themes.json' with {type:'json'};
import type {VisualTheme} from '../theme-library.ts';
export {digest} from '../theme-library.ts';
export const RELEASE3_THEMES=themes as unknown as readonly VisualTheme[];
export function visualTheme(id:string):VisualTheme {const t=RELEASE3_THEMES.find(t=>t.id===id);if(!t)throw Error('Unknown frozen direction');return t;}
