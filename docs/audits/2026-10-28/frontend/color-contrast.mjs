import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const css = fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');
const editorial = fs.readFileSync(path.join(root, 'src/components/Editorial.tsx'), 'utf8');
const editorialCss = fs.readFileSync(path.join(root, 'src/components/Editorial.module.css'), 'utf8');
function token(name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[a-fA-F0-9]{6})\\s*;`));
  if (!match) throw new Error(`Token missing: ${name}`);
  return match[1].toLowerCase();
}
function luminance(hex) {
  const components = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = components.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return linear.reduce((total, v, i) => total + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function ratio(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
}
if (!editorial.includes('<span className="eyebrow">MORE THAN A FINISHING TOUCH</span>') ||
    !/\.story\s*\{\s*background:\s*var\(--warm-ivory\)/.test(editorialCss) ||
    !/\.eyebrow\s*\{[^}]*font-size:\s*9px[^}]*color:\s*var\(--gold-ink\)/.test(css)) {
  throw new Error('Brand Story source relationship changed; re-inspect rather than reusing this evidence.');
}
const pairs = [
  { foreground: token('champagne-gold'), background: token('pure-white'), minimum: 3,
    consumer: 'Global keyboard focus outline against a white page surface',
    sources: ['src/app/globals.css:113-115', 'src/app/globals.css:5', 'src/app/globals.css:14-18'] },
  { foreground: token('champagne-gold'), background: token('pure-white'), minimum: 4.5,
    consumer: '12px Add Metal Variant text on the white admin card',
    sources: ['src/app/admin/page.tsx:719-738', 'src/app/admin/admin.module.css:38-40', 'src/app/globals.css:5,14,18'] },
  { foreground: token('champagne-gold-hover'), background: token('pure-white'), minimum: 4.5,
    consumer: '15px bold cart item price against the white drawer',
    sources: ['src/components/CartDrawer.module.css:250-253', 'src/components/CartDrawer.module.css:30', 'src/app/globals.css:6,14,18'] },
  { foreground: token('champagne-gold-hover'), background: token('pure-white'), minimum: 3,
    consumer: '20px bold cart total against the white drawer footer',
    sources: ['src/components/CartDrawer.module.css:257-260', 'src/components/CartDrawer.module.css:272-275'] },
  { foreground: token('gold-ink'), background: token('warm-ivory'), minimum: 4.5,
    consumer: '9px MORE THAN A FINISHING TOUCH eyebrow within Brand Story',
    sources: ['src/components/Editorial.tsx:114-126', 'src/app/globals.css:135', 'src/components/Editorial.module.css:94-96', 'src/app/globals.css:9,12'] },
  { foreground: token('gold-ink'), background: token('pure-white'), minimum: 4.5,
    consumer: 'Reference pair: dark gold is sufficient for normal text on pure white',
    sources: ['src/app/globals.css:12,14'] },
];
console.log(JSON.stringify({
  method: 'WCAG relative luminance: sRGB channel linearization, then (Llighter + 0.05)/(Ldarker + 0.05). Values are computed from current CSS tokens; this is source-based color evidence, not a full rendered-page contrast scan.',
  concreteIvoryConsumerChecked: true,
  note: "The Hero's own eyebrow uses --text-secondary, so it is not evidence for the gold-ink-on-ivory row.",
  pairs: pairs.map(pair => ({ ...pair, ratio: Number(ratio(pair.foreground, pair.background).toFixed(6)), passes: ratio(pair.foreground, pair.background) >= pair.minimum }))
}, null, 2));
