/** Original Vitris geometric drawing helpers. No third-party path data. */
export const p = (d: string) => `<path d="${d}"/>`;
export const c = (x: number, y: number, r: number) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
export const r = (x: number, y: number, w: number, h: number, radius = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}"/>`;
export const line = (d: string) => `<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`;
export const hole = (d: string) => `<path fill-rule="evenodd" d="${d}"/>`;
export const ring = (x: number, y: number, radius: number, inner: number) => hole(`M${x-radius} ${y}a${radius} ${radius} 0 1 0 ${radius*2} 0a${radius} ${radius} 0 1 0 -${radius*2} 0M${x-inner} ${y}a${inner} ${inner} 0 1 0 ${inner*2} 0a${inner} ${inner} 0 1 0 -${inner*2} 0`);
