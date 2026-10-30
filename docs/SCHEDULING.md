# Standard website booking

This unreleased source adds a standard customer booking page backed by the business admin's authoritative appointments. The flow is service, optional location/staff, time, contact details, policy/review, then confirmation or an approval-pending receipt. Both admin and website bookings use the same availability calculations, native resource reservations and calendar export queue.

This slice supports **test bookings only**. Customer emails, calendar attachments and private cancellation/rescheduling links are now implemented. Local emails are captured; sending requires explicit admin/provider setup and allowed test recipients. Production activation, deposits and structured address/intake remain later work. Published admin `0.1.0-alpha.1` does not contain these routes; release and pin compatible packages before installation. No deployment, publication or remote migration is performed by this feature.

## Connection

The compatible admin must enable scheduling, apply migrations through `0006_public_booking.sql`, configure staff/hours, select Test mode, publish services and provide customer policy text in Booking settings. Read its packaged `agent/refs/public-booking.md` for exact Origin, server enablement, Turnstile, rate limits and calendar setup.

Retain existing `launch.json` fields and add public metadata:

```json
{
  "publicOrigin": "https://www.BUSINESS.example",
  "scheduling": {
    "version": 1,
    "enabled": true,
    "apiOrigin": "https://admin.BUSINESS.example",
    "siteId": "EXACT_ADMIN_SITE_ID",
    "installationId": "EXACT_ADMIN_INSTALLATION_ID",
    "route": "/book"
  }
}
```

Use exact HTTPS origins without paths/trailing slashes, or explicitly configured loopback HTTP for isolated acceptance. Never include admin/provider credentials. The compiler rejects unknown connection fields, unsafe routes and collisions with an authored booking route.

Build normally with the compatible `vitris-build --site .`. The compiler generates the booking route if absent. To author its surrounding layout, create that route with exactly one `<div data-vitris-booking></div>`. An existing route without the marker is a conflict; authored content is never replaced silently. Preserve the component's standard internal layout and interaction contract. It uses approved site color/font tokens; agents compose surrounding content and links.

Add header and service actions linking to `/book`, optionally `/book?service=VERIFIED_SERVICE_ID`. Keep existing external booking links until the replacement is reviewed. Inline/modal booking is not implemented. Only the booking route receives its content-addressed component assets; sites without scheduling receive no booking runtime.

## Behavior and limits

The component reads services, prices, staff, policy and availability dynamically from admin. These operational changes need no website rebuild. It checks schema, site/installation identity and exact website origin. A production-connected build served on an unapproved preview host refuses to connect; use an explicit loopback connection for local testing.

Public routes are `/api/booking/v1/catalog`, `/availability` and `/appointments` on the admin origin, using exact-origin CORS and `credentials:omit`. They grant no admin authority and expose no customer records, staff accounts, private resources, internal availability or external event contents. Guest commands use their own transactional ledger, not an impersonated staff account. Bookings do not become leads or analytics enquiries automatically.

Times use the location's IANA timezone, with explicit offsets. A time is unreserved until committed. Current price/policy accompany availability; changed selections conflict rather than silently charging or showing obsolete terms. Required calendars refresh before commit. Native reservations, receipt, guest history and captured jobs commit together. Instant services confirm immediately; approval requests reserve time until their recorded deadline. Calendar failures after commitment retain the native appointment and durable export job.

The UI preserves details after conflicts. Uncertain responses offer Retry same booking with the same in-memory UUID/content. Do not close an uncertain request and create another; contact the business if that page is lost. Receipts describe the original acceptance and are not current appointment-management authority. No customer data or retry authority is persisted in browser storage. Booking works independently of optional analytics consent.

Receipts offer an `.ics` snapshot. Importing it does not provide ongoing sync or external busy-time access. Email state distinguishes capture, queued work, blocked/uncertain sending and provider acceptance; acceptance does not prove inbox delivery. Customer-site services requiring structured addresses are excluded until that intake capability is implemented.

## Confirmation emails and customer management

Review admin migration 0007 and its packaged `agent/refs/customer-notifications.md`. In Booking settings, explicitly enable customer emails and customer links, and set cancellation/rescheduling notice. Rules are snapshotted for new appointments. Local capture mode never sends mail; Send mode requires a separate restricted Cloudflare Email Service binding, sender/domain setup, a notification encryption key ring and an explicit test-recipient allowlist. These are server values, never website metadata.

The compiler generates the standard management page at the booking route plus `/manage` (normally `/book/manage`). An authored page there needs exactly one `data-vitris-customer-management` mount. Its indexing is forced off, it omits the harness beacon/web analytics, and its first head script removes URL fragments before other scripts. Avoid custom analytics or third-party scripts on this private route. Set the admin's `BOOKING_MANAGE_PATH` to the exact generated path for a custom booking route.

Email links contain appointment-only capabilities in fragments. Opening a link does not change the appointment; the customer explicitly opens its details and confirms a cancellation or replacement time. A short-lived bearer session and retry proof stay only in memory. Neither links nor sessions belong in query strings, referrers, logs or browser persistence. Links can be reopened until expiry; after a session expires, use the original valid email link. Changing recipients or closing an appointment revokes authority.

Customer rescheduling keeps service, staff, location, price, duration and approval rules, and checks current availability/calendar state. Pending approval stays pending with its original deadline. Failed replacements retain the original reservation. Changes use revisions and idempotency, including recovery from a lost cancellation response after access is revoked. Pausing new booking still permits eligible cancellation; rescheduling respects the scheduling pause. Expired or unavailable links direct the customer to contact the business; public email recovery/resend is not implemented.

The admin Customer emails tab previews captured messages and calendar attachments. It can review blocked/unknown sends; unknown sends require explicit acknowledgment before retry because they may already have been accepted. Captured messages never turn into sent messages merely by changing settings. Sender/domain and actual inbox acceptance remain separate from local fixtures.

Outside the explicitly isolated loopback fixture, Turnstile is mandatory. The component loads the official script at review with action `booking`; the server verifies success, action and hostname. Configure any CSP to allow the booking API for `connect-src` and Turnstile scripts/frames per [Cloudflare's CSP guidance](https://developers.cloudflare.com/turnstile/reference/content-security-policy/). Review real challenge execution separately from fixtures.

## Local acceptance

With sibling `website-admin-harness` and `vitris-harness` sources, run `npm run booking:preview` from the admin repository. Customer booking is **http://localhost:4392/book**; admin is **http://localhost:4391/#scheduling** (Open local demo). Both share real local workerd/D1 with explicitly simulated Google/Outlook HTTP. The loopback challenge fixture is labeled, and no real email/account is connected. Data resets on shutdown. Its shared IP allows five new attempts/hour; restarting resets ephemeral rate records.

Run website `npm run typecheck`, `npm test`, and `npm run verify:package`; run admin `npm run check`. Paired Chromium acceptance requires both source checkouts and proves guest booking appears in admin and the simulated calendar, duplicate/lost-response recovery, approval, current terms, empty states, mobile/keyboard behavior and accessibility. The admin check also installs packed packages outside both workspaces for a separate browser flow. Neither suite silently skips this integration when the sibling source is absent. Keep evidence ignored.

Real OAuth/challenge acceptance, notification onboarding, production mode, schema backup/recovery and customer rollout require separate reviewed releases and deployment authorization. A simulated receipt is not proof of deployed readiness.

Business-configurable reminder emails are managed by the admin harness in Booking settings. It supports up to three lead times and reuses the confirmation sender, calendar attachments and customer-management page. Reminder eligibility follows current business settings and confirmed appointment status; no website credentials or new website component are required. See the admin packaged `agent/refs/customer-notifications.md` and additive migration 0008 for setup and missed-reminder behavior.
