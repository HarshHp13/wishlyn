# Product delivery estimate

The product PIN check now gives an estimated arrival using India Post surface parcel timings as a reference, starting from Sector 27, Noida, Uttar Pradesh, PIN 201301. The delivery partner and service are not yet selected and will be confirmed for the order. Date math assumes an order placed today and booking by the end of the next day in Asia/Kolkata. This remains an internal calculation rule; customer-facing results and shipping details omit booking-assumption prose. It does not change checkout shipping prices or claim that a PIN lookup confirms service availability.

## Planning assumptions

These are Wishlyn planning ranges for a reference estimate, not a selected delivery service or current India Post retail delivery commitments:

| Destination identified by the PIN lookup | Postal days after booking |
| --- | --- |
| Origin PIN 201301 in Uttar Pradesh | 3–5 |
| Other Uttar Pradesh PINs | 4–7 |
| Other Indian states and territories | 7–10 |

A possible branch-office delivery, or missing delivery-office metadata, adds one postal day to the upper bound. Mixed post-office results cannot identify the exact recipient office, so the lower bound remains unchanged. Only an exact origin PIN and state match gets the shortest range; neither Delhi/NCR nor the whole Gautam Buddha Nagar district is treated as local.

Booking moves to the next postal day when tomorrow is Sunday or a national holiday. The booking day never counts toward transit because end-of-day acceptance may miss dispatch cutoff. Saturdays count; Sundays and Republic Day (26 January), Independence Day (15 August), and Gandhi Jayanti (2 October) do not. Other central, state, regional and local postal holidays are not modelled, and the UI states that they may add time. No distance calculation or live carrier-routing promise is implied.

## Sources checked 31 October 2026

- [India Post Parcel (Retail)](https://www.indiapost.gov.in/mail%26Parcel/mailproducts/domesticservices/indiapostparcel): identifies the retail service as the successor to registered parcels and says transport is ordinarily by surface. This current retail page does not publish a delivery timetable.
- [India Post Citizens' Charter 2021, page 4, section 1.3](https://www.indiapost.gov.in/documents/CitizenCharter2021.pdf): historical Business Parcel and Second Class Mail (including parcels) benchmarks are 3 days local, 3–6 within a state, and 6–7 elsewhere. It excludes Sundays, holidays and after-cutoff posting days, with an extra day for branch offices. The broader, more conservative store ranges above are informed by these parcel benchmarks; the legacy figures are not presented as current retail guarantees.
- [Postal PIN lookup for 201301](https://api.postalpincode.in/pincode/201301): includes Noida Sector 27 with PIN 201301. This third-party lookup is used only to identify an area and possible office type.

## Validation

- `npm run typecheck` and `npm run lint` passed.
- `npm run test:storefront`: 32 passed, 5 database-dependent tests skipped without their dedicated fixture database. Ten new deterministic tests cover service ranges, India midnight, Sunday booking, Saturdays, national holidays, month/year/leap boundaries, possible branch-office allowance and malformed/mismatched lookup data.
- `playwright-cli -s=postal-copy run-code --filename=tests/storefront/delivery-browser-checks.mjs` passed on the local product page. Checked keyboard submission, invalid PINs without a request, local/national date ranges, Sunday-adjusted date ranges without booking-assumption prose, network/malformed/not-found errors, timeout recovery, stale requests, live-region semantics, consistent shipping copy, and explicit wording that the delivery partner remains unconfirmed. Viewports 320, 390, 768 and 1440 pixels had no horizontal overflow. No page exceptions.
- Screenshots inspected at 390 and 1440 pixels; files are local at `/tmp/wishlyn-bag-delivery/postal-mobile.png` and `postal-desktop.png`. Postal API responses were mocked for deterministic UI validation. The local development database was read only; mutation requests were blocked.

To rerun the browser checks, open a local product page in an isolated Playwright session first. The script fixes the browser date to 31 October 2026 and expects a product page with the new PIN checker.
