import metadata from './assets.json' with {type:'json'};
export {assetUrl,fontFaces} from '../theme-assets.ts';
export const THEME_ASSETS=metadata;
export const asset=(id:string)=>{const a=metadata.assets.find(a=>a.id===id);if(!a)throw Error('Unknown frozen asset');return a;};
