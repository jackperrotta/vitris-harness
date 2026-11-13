export type ChatGPTBusinessConfig = {
  version: 1;
  inquiryPath?: string;
  crawlers?: Partial<Record<'search' | 'ads' | 'training', 'allow' | 'disallow'>>;
};

export const chatgptSources = ['chatgpt', 'chatgpt_paid'] as const;
export type ChatGPTSource = typeof chatgptSources[number];

export function isChatGPTSource(value: unknown): value is ChatGPTSource {
  return value === 'chatgpt' || value === 'chatgpt_paid';
}

export function chatgptBusinessConfig(value: unknown): ChatGPTBusinessConfig | undefined {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid site.json chatgptBusiness configuration');
  const config = value as ChatGPTBusinessConfig;
  if (config.version !== 1 || Object.keys(config).some(key => !['version', 'inquiryPath', 'crawlers'].includes(key))) {
    throw Error('Invalid site.json chatgptBusiness version or fields');
  }
  if (config.inquiryPath !== undefined && (typeof config.inquiryPath !== 'string' ||
      !/^\/(?:[a-zA-Z0-9][a-zA-Z0-9._~-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._~-]*)*\/?)?$/.test(config.inquiryPath))) {
    throw Error('chatgptBusiness.inquiryPath must be a public website path without a query or fragment');
  }
  const crawlers = config.crawlers;
  if (crawlers !== undefined && (!crawlers || typeof crawlers !== 'object' || Array.isArray(crawlers) ||
      Object.entries(crawlers).some(([key, rule]) => !['search', 'ads', 'training'].includes(key) || !['allow', 'disallow'].includes(rule)))) {
    throw Error('chatgptBusiness.crawlers accepts allow or disallow for search, ads, and training');
  }
  return config;
}

/** The browser beacon uses this same self-contained function. */
export function classifyChatGPTSource(utmSource: string, utmMedium: string, referrer: string): ChatGPTSource | null {
  const source = utmSource.trim().toLowerCase();
  const tagged = ['chatgpt', 'chatgpt.com', 'www.chatgpt.com'].includes(source);
  if (tagged) return /^(cpc|ppc|paid|display|ads)$/.test(utmMedium.trim().toLowerCase()) ? 'chatgpt_paid' : 'chatgpt';
  if (source) return null;
  try {
    const url = new URL(referrer.includes('://') ? referrer : 'https://' + referrer);
    if (url.protocol === 'https:' && ['chatgpt.com', 'www.chatgpt.com', 'chat.openai.com'].includes(url.hostname)) return 'chatgpt';
  } catch { /* No usable ChatGPT referrer. */ }
  return null;
}
