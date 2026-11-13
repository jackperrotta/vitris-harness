import { chatgptSources, type ChatGPTSource } from '../integrations/chatgpt-business.ts';

export async function chatgptInquiryAttributionAvailable(db: D1Database): Promise<boolean> {
  return !!await db.prepare("SELECT name FROM pragma_table_info('form_submissions') WHERE name='attribution_source'").first();
}

export async function chatgptTrafficAttributionAvailable(db: D1Database): Promise<boolean> {
  return !!await db.prepare("SELECT name FROM pragma_table_info('analytics_events') WHERE name='attribution_source'").first();
}

type Count = { source: ChatGPTSource; count: number };
type LandingCount = Count & { path: string };

export async function readChatGPTTraffic(db: D1Database, tenant: string, days: number) {
  if (!await chatgptTrafficAttributionAvailable(db)) {
    return chatgptSources.map(source => ({source, landingPageviews: null, landingPages: null}));
  }
  const window = `-${days - 1} days`;
  const where = `tenant_id=? AND day BETWEEN date('now',?) AND date('now')
    AND kind='pageview' AND src='live' AND attribution_source IS NOT NULL`;
  const [totals, landings] = await db.batch<LandingCount>([
    db.prepare(`SELECT attribution_source AS source,COUNT(*) AS count FROM analytics_events WHERE ${where} GROUP BY attribution_source`).bind(tenant, window),
    db.prepare(`WITH landings AS (
      SELECT attribution_source AS source,path,COUNT(*) AS count FROM analytics_events WHERE ${where} GROUP BY attribution_source,path
    ), ranked AS (
      SELECT *,ROW_NUMBER() OVER (PARTITION BY source ORDER BY count DESC,path) AS rank FROM landings
    ) SELECT source,path,count FROM ranked WHERE rank<=10 ORDER BY source,rank`).bind(tenant, window),
  ]);
  if (!totals || !landings) throw Error('Incomplete ChatGPT attribution results');
  return chatgptSources.map(source => ({
    source,
    landingPageviews: totals.results.find(row => row.source === source)?.count || 0,
    landingPages: landings.results.filter(row => row.source === source).map(({path,count}) => ({path, landingPageviews: count})),
  }));
}

export async function readChatGPTAttribution(db: D1Database, tenant: string, days: number) {
  const sources = await readChatGPTTraffic(db, tenant, days);
  const inquiryAttribution = await chatgptInquiryAttributionAvailable(db);
  const inquiries = inquiryAttribution ? (await db.prepare(`SELECT attribution_source AS source,COUNT(*) AS count
    FROM form_submissions WHERE tenant_id=? AND mode='live' AND attribution_source IS NOT NULL
    AND created_at>=date('now',?) AND created_at<date('now','+1 day') GROUP BY attribution_source`)
    .bind(tenant, `-${days - 1} days`).all<Count>()).results : null;
  return {
    version: 1 as const, days,
    sources: sources.map(row => ({
      ...row,
      acceptedInquiries: inquiries ? inquiries.find(item => item.source === row.source)?.count || 0 : null,
    })),
  };
}
