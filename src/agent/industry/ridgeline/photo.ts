import media from './media/manifest.json' with {type:'json'};
import {esc} from '../markup.ts';

type ImageAsset=typeof media.assets[number]&{alt:string;focal:string;ratio:string;dimensions:{width:number;height:number}};

export function ridgeAsset(id:string):ImageAsset{
  const asset=media.assets.find(item=>item.id===id);
  if(!asset||asset.kind!=='image')throw Error('Missing Ridgeline photograph '+id);
  return asset as ImageAsset;
}

export function compare(beforeId:string,afterId:string,caption:string):string{
  const before=ridgeAsset(beforeId),after=ridgeAsset(afterId);
  const img=(asset:ImageAsset,cls:string)=>`<img class="${cls}" src="/theme-assets/${asset.sha256}/${asset.file}" alt="${esc(asset.alt)}" width="${asset.dimensions.width}" height="${asset.dimensions.height}" decoding="async">`;
  return `<div class="ba" data-ridge-ba><div class="ba-stage">${img(after,'ba-after')}<div class="ba-top">${img(before,'ba-before')}</div></div><label>Drag or use arrow keys. Home and End jump to the ends. <input type="range" min="0" max="100" value="50" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" aria-valuetext="50 percent after visible. 0 is all before, 100 is all after."></label><p data-ba-label>50 percent after visible</p><p>${caption}</p></div>`;
}

export function photo(id:string,caption:string,options:{ratio?:string;position?:string;eager?:boolean}={}):string{
  const asset=ridgeAsset(id);
  const ratio=options.ratio||asset.ratio;
  const position=options.position||asset.focal;
  return `<figure class="photo"><img src="/theme-assets/${asset.sha256}/${asset.file}" alt="${esc(asset.alt)}" width="${asset.dimensions.width}" height="${asset.dimensions.height}" loading="${options.eager?'eager':'lazy'}" decoding="async" style="aspect-ratio:${ratio};object-position:${position}"><figcaption>${caption}<small>Generated demonstration. Not a record of completed customer work.</small></figcaption></figure>`;
}
