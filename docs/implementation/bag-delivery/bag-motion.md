# Shopping bag motion

## Cause and fix

The native `dialog` was a scroll container. When `showModal()` focused the close button inside the off-screen, translated panel, the browser scrolled the dialog horizontally to expose it. Frame sampling showed `scrollLeft` jumping to 440px and following the animated transform back to zero. The panel stayed around x=1000px and wobbled by fractions of a pixel instead of sliding in.

The wrapper now uses `overflow: clip`, so focus cannot scroll it. Only the existing panel transform and overlay opacity animate. Native modal focus handling, dismissal, and cart state logic remain unchanged. Symmetric stable scrollbar gutters keep page content centered and prevent page-width changes when scrolling is locked; the full-viewport modal is centered across those gutters. The panel can scroll vertically when a short viewport cannot fit its sections, while the item list retains a usable minimum height.

## Validation

- `npm run lint` and `npm run typecheck`.
- `tests/storefront/bag-motion-browser.mjs` records opening frames at 1440px, 390px, and 320px. It checks visible, monotonic entry, zero dialog horizontal scrolling, stable page position/width, and a panel flush with the viewport edge.
- Browser checks cover initial focus, native modal keyboard isolation, Escape, backdrop dismissal, restored trigger focus, four interrupted open/close cycles, populated guest bag/gift text, refreshed checkout availability, reachable checkout and item scrolling at 844×390, and reduced motion.
- Before/after local browser recordings and frame samples were captured. Desktop browser measurements are evidence for the corrected scroll/animation interaction; they are not a real-device GPU performance guarantee.

To repeat, run the local app with `APP_ORIGIN` matching its port, open an in-stock product with `playwright-cli -s=bag-check open http://localhost:3002/product/<product-id>`, and run `playwright-cli -s=bag-check run-code --filename=tests/storefront/bag-motion-browser.mjs`. The check clears that browser session's guest storage and blocks non-catalogue writes.
