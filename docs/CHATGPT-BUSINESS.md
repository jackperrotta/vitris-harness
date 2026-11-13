# Businesses in ChatGPT

Use the website harness to prepare an existing site's public business details, crawler settings, and first-party attribution. The authorized business owner manages the listing, verification, agent, and aggregate OpenAI insights in [Business Hub](https://chatgpt.com/business-hub). See [OpenAI's setup guide](https://help.openai.com/en/articles/20001635-setting-up-your-business-on-chatgpt).

## Prepare a website

1. Check the public name, phone, email, and any public business address in `site.json`. Set the exact production HTTPS origin in `launch.json.publicOrigin`. Make the business details and inquiry page easy to find in the public HTML.
2. Add the optional block below to `site.json`. Each crawler rule is independent. Omitted rules inherit the site's normal crawler policy. The example opts in to search, leaves the ad crawler policy at its default, and opts out of GPTBot training crawls. Choose the training policy with the site owner and review the applicable terms before connecting a product feed.
3. Run `vitris chatgpt-business inspect --site . --json`. Use the profile details and inquiry URL in the result for the owner handoff. The command reads local files. Check the deployed canonical pages and sitemap, and confirm CDN/WAF access from OpenAI's published crawler ranges separately. Review the site's consent and privacy language before enabling attribution.
4. In Business Hub, select the correct listing and use one of the offered verification methods. For domain verification, add the exact TXT record shown by Business Hub at the DNS provider. Complete Persona there. Review the profile and, if eligible, preview the Business Agent before publishing. Set the agent's customer handoff to the reviewed inquiry URL. Keep identity documents and verification codes in the verification flow.

```json
{
  "chatgptBusiness": {
    "version": 1,
    "inquiryPath": "/contact",
    "crawlers": {
      "search": "allow",
      "training": "disallow"
    }
  }
}
```

For paid campaigns, check the live landing page and image hosts for `OAI-AdsBot` and applicable search crawler access. Campaign setup, Measurement Pixel, Conversions API, hosted commerce feeds, and custom plugins have their own deployment and eligibility requirements. The website preparation uses first-party analytics. [OpenAI crawlers](https://developers.openai.com/api/docs/bots) · [Advertiser crawler guidance](https://help.openai.com/en/articles/20001243-advertiser-guidance-for-allowing-openai-web-crawlers)

## Website analytics and inquiries

- The opt-in marks indexable pages for the existing beacon. A pageview counts as a ChatGPT landing when its UTM source or referring host matches the explicit allowlist. Paid requires an explicit ChatGPT UTM source and a paid medium such as `cpc`. The source is separate from the existing traffic channel. Preview visits, bots, and legacy untagged records are excluded.
- After affirmative analytics consent, the browser remembers the source for the current tab session. The built-in form adds `vitris_source` to its submission URL. A custom form can use the same `window.vitrisChatGPTSource?.()` getter at submit time. It returns `chatgpt`, `chatgpt_paid`, or `null`. Read it immediately before submission so withdrawal takes effect. Keep only the validated enum, outside customer answers and notification bodies.
- Apply the additive `0007_chatgpt_attribution.sql` to a compatible standard website Worker database as a separately reviewed release. The source is saved on acceptance in the same transaction as the inquiry. Test submissions, failed submissions and repeated receipts do not increase live counts. Older schemas still accept forms and collect ordinary analytics.
- For the tryvitris.com pilot, the public repo is `vitris-website`, the dedicated collector and admin read projection are in `vitris-analytics`, and the public inquiry uses its own Worker and D1 schema. Roll the new beacon into the verified website build. Update the dedicated collector with the same classification and storage rule, and add an independent nullable enum migration to the inquiry database. In the custom inquiry Worker, set it only on the existing transition from draft to submitted, preserving the first committed receipt and notification. Project that value through the existing read-only inquiry adapter. Apply each migration to its owning database and verify those deployed adapters separately.

## Admin harness contract

Use the existing exact tenant, installation, origin and bearer grant. The Analytics request is `GET /api/admin/v1/TENANT/analytics?days=30&attribution=chatgpt` with `analytics:read`. Standard leads reads continue to use `leads:read`. No scope expansion is needed.

```json
{
  "chatgptAttribution": {
    "version": 1,
    "days": 30,
    "sources": [
      {
        "source": "chatgpt",
        "landingPageviews": 12,
        "landingPages": [{"path": "/contact", "landingPageviews": 4}],
        "acceptedInquiries": 2
      },
      {
        "source": "chatgpt_paid",
        "landingPageviews": 0,
        "landingPages": [],
        "acceptedInquiries": 0
      }
    ]
  }
}
```

Metrics cover the requested UTC window including the partial current day. Landing pages are limited to the ten highest counts per source. Landing pageviews can include multiple visits by one person. An omitted attribution object means the backend does not expose the report. Within the object, `null` means the corresponding storage is unavailable, and a numeric zero means no matching events are stored in the window. Historical records are left as recorded, so coverage starts when the collector and website opt-in are both active.

Production lead rows add `attribution_source: "chatgpt" | "chatgpt_paid" | null` when supported. The ordinary lead source, pagination and permissions retain their existing meanings. Older backends omit the field. Business Hub verification and insights stay in Business Hub.
