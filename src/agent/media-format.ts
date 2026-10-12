export function assertSafeSvg(svg: string): void {
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg) || /<!DOCTYPE|<!ENTITY|<\s*(?:script|style|foreignObject|iframe|object|embed|image|use|a)\b|\bon[a-z]+\s*=|(?:href|src)\s*=|url\s*\(|javascript:|data:/i.test(svg)) throw new Error("Unsafe SVG: only self-contained geometry and editable text are supported");
}
export function mediaDimensions(bytes: Buffer, ext: string): {width:number;height:number} | undefined {
  if(ext==="png" && bytes.length>24 && [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return {width:new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(16),height:new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(20)};
  if(ext==="svg"){
    const svg=bytes.toString();assertSafeSvg(svg);
    const width=Number(svg.match(/\bwidth=["']([0-9.]+)(?:px)?["']/)?.[1]),height=Number(svg.match(/\bheight=["']([0-9.]+)(?:px)?["']/)?.[1]);
    if(width>0&&height>0)return {width,height};
    const box=svg.match(/\bviewBox=["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)\s*["']/);if(box)return {width:Number(box[1]),height:Number(box[2])};
  }
  if(["jpg","jpeg"].includes(ext)&&bytes[0]===255&&bytes[1]===216){let p=2;while(p+9<bytes.length){if(bytes[p]!==255)break;const code=bytes[p+1]!;if(code===217||code===218)break;if(code===216){p+=2;continue;}const len=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint16(p+2);if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(code))return {width:new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint16(p+7),height:new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint16(p+5)};if(len<2)break;p+=len+2;}}
  return undefined;
}
