/** Immutable display metadata for release .2; bytes remain content-addressed. */
import {asset as currentAsset,assetUrl,fontFaces} from '../theme-assets.ts';
import frozenManifest from './asset-manifest.json' with {type:'json'};
const manifest=frozenManifest as {assets:ReturnType<typeof currentAsset>[]};
export const asset=(id:string)=>{const entry=manifest.assets.find(a=>a.id===id);if(!entry)throw Error('Missing archived asset '+id);return entry;};
export {assetUrl,fontFaces};
