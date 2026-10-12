export type StockKind = "image" | "video";

export type MediaInspection = {
  version: 1; assetHash: string; observedAt: string; observer: string;
  description: string; evidence: string[];
  subjects: string[]; activities: string[]; settings: string[];
  industries: string[]; roles: string[]; palette: string[];
  lighting: string; density: "low" | "medium" | "high";
  focalPoint: string; negativeSpace: string[]; cropNotes: string;
  visibleText: boolean; motion?: string; uncertainty: string[];
};

export type StockItem = {
  id: string;
  kind: StockKind;
  src: string;
  thumb: string;
  alt: string;
  tags: string[];
  categories: string[];
  credit: string;
  pexelsId: number;
  sha256?: string;
  sourceUrl?: string;
  downloadUrl?: string;
  thumbnailUrl?: string;
  acquiredAt?: string;
  termsUrl?: string;
  width?: number;
  height?: number;
  bytes?: number;
  duration?: number;
  thumbSha256?: string;
  thumbBytes?: number;
  legacySrc?: string;
  legacyThumb?: string;
  inspection?: MediaInspection;
  status?: "staged" | "accepted" | "excluded";
};

export type StockCatalog = {
  version: 1 | 2;
  items: StockItem[];
};
