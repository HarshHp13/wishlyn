# Shopping bag motion and delivery estimates

This change improves the shopping bag transition and adds a delivery estimate to the product PIN-code check.

## Acceptance criteria

- The shopping bag opens and closes without a page jump or competing animations.
- Escape, backdrop dismissal, focus restoration, interrupted transitions, and reduced-motion preferences continue to work.
- Product delivery estimates start in Sector 27, Noida and include booking by the end of the following day in India time.
- Estimates explain the India Post service and calendar assumptions and remain distinct from a delivery guarantee.
- Invalid PIN codes, unavailable lookups, and stale requests are handled accessibly.

## Integration workflow

The bag and delivery changes are implemented in separate pull requests targeting this branch. Each implementation requires two independent reviewer LGTMs before merge. The combined pull request targets `main` and remains open for the owner to merge.
