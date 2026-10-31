# Shopping bag motion and delivery estimates

The shopping bag now opens without the native dialog scrolling against its slide animation. The product PIN check estimates arrival from Sector 27, Noida (201301), assuming booking by the end of the next day in India time, or the next open postal day.

India Post surface parcel timings are a planning reference only. The actual delivery carrier and service remain undecided. The UI identifies the result as a Wishlyn estimate and says the delivery partner will be confirmed for the order. The booking assumption remains in the date calculation but is omitted from the customer-facing result and shipping details.

## Implementation and review

Both implementation PRs targeted `codex/bag-motion-delivery`. Each was merged only after two independent reviewer LGTMs on its final head.

| Implementation | Reviewed head | Reviewer 1 | Reviewer 2 |
| --- | --- | --- | --- |
| [Delivery estimate, PR #10](https://github.com/HarshHp13/wishlyn/pull/10) | `7bd2586edf453a93d95e5c41bcd22868cc3bb057` | [LGTM](https://github.com/HarshHp13/wishlyn/pull/10#issuecomment-6543077773) | [LGTM](https://github.com/HarshHp13/wishlyn/pull/10#issuecomment-6543079360) |
| [Bag motion, PR #11](https://github.com/HarshHp13/wishlyn/pull/11) | `3434f84847730bd939083323ae2830f2ca27f416` | [LGTM](https://github.com/HarshHp13/wishlyn/pull/11#issuecomment-6543079824) | [LGTM](https://github.com/HarshHp13/wishlyn/pull/11#issuecomment-6543082879) |

The [combined PR #9](https://github.com/HarshHp13/wishlyn/pull/9) targets `main` and remains open for the owner to merge.

## Combined verification

Validated implementation merge `a057383932c9266a6baa8672d7fb220bce8dd3c3` on 31 October 2026:

- `npm run verify` passed against a dedicated disposable PostgreSQL server: 254 tests passed, no failures or skips; lint, typecheck, secret-pattern check, and production build passed; production dependency audit found zero vulnerabilities.
- Both focused browser scripts passed together on the local product page. [Combined results](integrated-browser-results.json) cover desktop/mobile entry measurements, stable page position, rapid reopening, focus/dismissal, populated bag and gifts, checkout refresh, short-height scrolling, reduced motion, delivery ranges, closure assumptions, and invalid/stale/unavailable/timed-out PIN lookups.
- Reviewers independently checked additional calendar cases, reduced-motion changes during entry, and keyboard access on short screens.
- Browser measurements were made in desktop Chromium with mobile viewport sizes, not on physical mobile hardware. PIN responses were mocked for deterministic checks.

See [bag motion](bag-motion.md) for the measured cause and [delivery estimate](delivery-estimate.md) for planning ranges and sources.
