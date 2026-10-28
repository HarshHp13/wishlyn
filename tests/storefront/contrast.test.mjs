import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');
const token = name => css.match(new RegExp(`--${name}: (#[a-fA-F0-9]{6})`))[1];
function luminance(hex) {
  const colors = hex.match(/[a-f\d]{2}/gi).map(value => {
    const number = parseInt(value, 16) / 255;
    return number <= .04045 ? number / 12.92 : ((number + .055) / 1.055) ** 2.4;
  });
  return colors[0] * .2126 + colors[1] * .7152 + colors[2] * .0722;
}
for (const [foreground, background] of [['gold-ink', 'warm-ivory'], ['pure-white', 'gold-ink'], ['muted-sand', 'warm-ivory'], ['gold-ink', 'soft-peach'], ['deep-espresso', 'champagne-gold']]) {
  test(`${foreground} on ${background} meets normal text contrast`, () => {
    const [light, dark] = [luminance(token(foreground)), luminance(token(background))].sort((a, b) => b - a);
    assert.ok((light + .05) / (dark + .05) >= 4.5);
  });
}
