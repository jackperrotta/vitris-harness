import { createHash } from "node:crypto";
import { Buffer } from 'node:buffer';
import type { ThemeTokens } from "../../types.ts";

export const THEME_RELEASE = "2026-10-08.1";
export const SPECIMEN_VERSION = 1;
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])) : value;
export const digest = (value: unknown): string => createHash("sha256").update(typeof value === "string" ? value : value instanceof Uint8Array ? value : JSON.stringify(canonical(value))).digest("hex");
export type VisualTheme = {
  id: string; release: string; name: string; description: string;
  tokens: ThemeTokens; principles: string[]; image: string; motion: string;
  freedoms: string; brandRule: string; license: string;
};
const sans = 'Arial, Helvetica, sans-serif';
const human = '"Trebuchet MS", Calibri, sans-serif';
const serif = 'Georgia, "Times New Roman", serif';
const mono = 'Consolas, "Courier New", monospace';
function theme(id: string, name: string, description: string, colors: string[], fonts: string[], shape: string[], steps: string[], rhythm: string, principles: string[], image: string): VisualTheme {
  return { id, release: THEME_RELEASE, name, description,
    tokens: { colorBg: colors[0]!, colorText: colors[1]!, colorMuted: colors[2]!, colorSurface: colors[3]!, colorSurface2: colors[4]!, colorBorder: colors[5]!, colorAccent: '#224b43', colorAccentText: '#ffffff', colorFocus: '#224b43', fontBody: fonts[0]!, fontDisplay: fonts[1]!, radius: shape[0]!, radiusLg: shape[1]!, radiusPill: shape[2]!, maxWidth: '76rem', typeStep0:steps[0], typeStep1:steps[1],typeStep2:steps[2],typeStep3:steps[3],typeStep4:steps[4],typeStep5:steps[5], sectionY: rhythm },
    principles, image, motion: 'Content and controls remain visible without animation. Use brief local feedback only; honor reduced motion.',
    freedoms: 'Design page architecture, hierarchy, section order, visitor journeys, compositions and business-specific interactions from actual content. Neither specimen is a required homepage or component template.',
    brandRule: 'Preserve the original logo on a white plate. Preserve required brand colors as accents; derive a readable action companion when necessary. Keep the theme surface and type identity.',
    license: 'Original Vitris design and code-native specimen artwork. System fonts only; no bundled third-party font or customer media.' };
}
export const VISUAL_THEMES: readonly VisualTheme[] = [
  theme('precision', 'Precision', 'Crisp rules, compact rhythm and a confident, ordered voice.', ['#f7f9fa','#17272d','#4a5b63','#ffffff','#eaf0f2','#bdcbd0'], [sans,sans], ['2px','2px','2px'], ['.9rem','1rem','1.3rem','1.8rem','2.6rem','clamp(2.5rem,5vw,4rem)'], '3.5rem', ['Left-align to a disciplined grid; use fine rules to organize real information.','Compact sans hierarchy with purposeful whitespace; square geometry.'], 'Crop cleanly, align edges and use brief, specific captions.'),
  theme('editorial', 'Editorial', 'Literary serif contrast, generous margins and a measured reading pace.', ['#faf8f3','#29271f','#625d51','#ffffff','#efece3','#c9c3b6'], [sans,serif], ['0','0','0'], ['.95rem','1.1rem','1.4rem','2rem','3.2rem','clamp(3rem,6vw,5.5rem)'], '6rem', ['Expressive serif headlines contrast with quiet sans navigation.','Use editorial measures, oversized initial moments and clearly authored captions.'], 'Let one image breathe; captions read like a considered publication.'),
  theme('signal', 'Signal', 'Oversized type, decisive blocks and unmistakable emphasis.', ['#ffffff','#17191b','#55595c','#f0f0ed','#e6e7e3','#aaaca6'], [sans,sans], ['0','0','0'], ['.9rem','1.05rem','1.5rem','2.3rem','4rem','clamp(3rem,6vw,5rem)'], '4rem', ['Heavy tightly set display typography with short emphatic phrases.','Alternate emphatic solid fields and quiet detail; avoid shouting through every section.'], 'Use strong graphic crops, decisive edges and sparing captions.'),
  theme('crafted', 'Crafted', 'Humanist lettering, soft corners and tactile, thoughtful details.', ['#f5f1e8','#35352b','#666457','#fffcf5','#eae5d8','#c8c0ac'], [human,serif], ['12px','42px 4px 42px 4px','6px'], ['.95rem','1.1rem','1.4rem','2rem','2.8rem','clamp(2.8rem,5vw,4.6rem)'], '5rem', ['Humanist body and gently expressive serif create warmth without rustic props.','Fine inset borders, offset framing and modest asymmetry supply tactile character.'], 'Use inset framing and warm neutral surrounds; preserve original image color.'),
  theme('gallery', 'Gallery', 'Quiet typography and expansive framing put the visual story first.', ['#ffffff','#28292b','#626366','#f5f5f4','#ececeb','#d3d3d0'], [sans,sans], ['0','0','0'], ['.85rem','1rem','1.2rem','1.6rem','2.1rem','clamp(2.2rem,4vw,3.5rem)'], '7rem', ['Restrained light display, very generous media intervals and small disciplined labels.','Establish image and caption hierarchy; permit content-led dense pages too.'], 'Frame images as exhibits with generous surrounding space and separated captions.'),
  theme('technical', 'Technical', 'Precise labels, modular grids and selective monospace detail.', ['#f1f5f4','#1d322f','#50645e','#ffffff','#e0e9e5','#aabfb5'], [sans,mono], ['0','0','0'], ['.85rem','1rem','1.25rem','1.7rem','2.5rem','clamp(2.5rem,4.5vw,4rem)'], '4rem', ['Use monospace for display and meaningful labels; body copy remains readable sans.','Visible grid coordinates and diagram conventions clarify real relationships; never invent metrics.'], 'Use annotated framing and real explanatory diagrams, never decorative fake data.'),
  theme('expressive', 'Expressive', 'Buoyant shapes, lively scale and an open, inviting personality.', ['#f5f3ff','#302849','#625777','#ffffff','#e8e1f5','#c4b6dd'], [human,sans], ['24px','70px 10px 70px 10px','999px'], ['.95rem','1.1rem','1.5rem','2.2rem','3.4rem','clamp(3.2rem,6vw,5.5rem)'], '5rem', ['Rounded heavy display, playful scale relationships and deliberate shape contrast.','Use controlled accent fields and clear conventional controls; vary compositions beyond card grids.'], 'Use confident rounded crops and graphic framing without obscuring subject matter.'),
  theme('atmospheric', 'Atmospheric', 'Deep tonal surfaces, luminous detail and a quietly cinematic pace.', ['#151e24','#f1f4f5','#b2c1ca','#202e37','#2b3a44','#50616d'], [sans,serif], ['4px','4px','4px'], ['.95rem','1.05rem','1.4rem','2rem','3rem','clamp(3rem,6vw,5rem)'], '6rem', ['Dark layered surfaces and deliberate light typography create depth without compulsory glows.','Use quiet pacing, fine light rules and selective emphasis; retain readable static content.'], 'Let imagery sit in dark frames; preserve image contrast and original logo on a light plate.'),
];
export function visualTheme(id: string): VisualTheme {
  const value = VISUAL_THEMES.find(t => t.id === id || t.name.toLowerCase() === id.toLowerCase());
  if (!value) throw new Error(`Unknown theme: ${id}`);
  return value;
}
export const themeHash = (theme: VisualTheme): string => digest(theme);
