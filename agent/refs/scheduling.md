# Optional standard appointment booking

Load only for sites requesting scheduling. Read the installed harness `docs/SCHEDULING.md` and compatible admin's `public-booking.md`. Website owns the booking page and calls to action; admin owns published services, terms, staff, availability, appointments and calendar sync.

Use the standard component on `/book` or the explicit configured route. Add reviewed public `launch.json.scheduling` metadata only. An authored booking page needs exactly one `data-vitris-booking` mount. Preserve internal steps, spacing and interactions; use approved theme tokens and compose the surroundings. Add relevant header/service links; verified service IDs can preselect via `?service=ID`. Preserve supplied wording and existing booking links until a reviewed replacement is ready.

Verify duration, pricing basis, eligible staff, location/timezone, approval rules and business policy. Never invent services, working hours, cancellation rules or fixed duration for uncertain work. Maintain these facts in admin. Customer management links and emails are implemented behind explicit settings; structured intake, customer accounts, deposits and production activation remain later work.

This source accepts test-mode guest bookings only. Loopback acceptance uses clearly simulated calendars. Real enabled calendar connections receive test appointments; an unapproved preview hostname cannot connect silently. Never claim a captured message was delivered. Scheduling is independent of form collection and analytics, and appointments do not become leads automatically.

For customer emails read the admin's `customer-notifications.md`. The generated management route is the booking path plus `/manage`; keep its standard mount and early token-removal script. Never add analytics/third-party scripts, token-bearing queries or browser persistence there. Email links only authorize one appointment and require explicit view/change actions. Verify cancellation/rescheduling from a captured email, unchanged reservations after conflicts, notice cutoffs, link expiry, duplicate-safe retries and the matching admin/calendar update. Sender setup and real inbox acceptance are separate from capture/provider fixtures.

Verify customer booking against the actual compatible admin and shared D1: service/time, current price/policy/timezone, confirmation versus approval, native calendar/history visibility, busy blocking, export, stale/lost responses without duplication, empty/error states and mobile/keyboard access. Optional analytics refusal must not disable booking. Turnstile/provider fixtures do not prove live acceptance. Keep evidence ignored and stop at verified local output; remote migrations, publication and deployment remain separate.

## Visual and state continuity

Use the site's shared typography roles for booking headings, copy, labels, summaries, controls and notices. Standard panel headings use the card-title role; keep deliberate surrounding page hierarchy in the site-owned wrapper. Match the approved palette and spacing around the component without overriding its standard steps or shrinking content to fit a fixed card.

Inspect the complete customer journey at phone and desktop widths, including populated and expanded summaries, long service/policy text, no services, no times, validation, submission, conflicts, uncertain retry, confirmation and approval-pending receipt. A changed price or policy must be visible before acceptance; a recoverable failure keeps contact details and offers a clear next action. Check the private management page's readable details, replacement-time review and cancellation result as well. Preserve its early capability removal, no-analytics rule and in-memory retry/session authority.

The published admin 1.0.0 is the compatible package family. Booking remains opt-in and test-only; a stable npm version does not activate production booking, calendar writes or email delivery on a customer installation.
