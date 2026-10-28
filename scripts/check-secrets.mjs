import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(file => /^(src\/|scripts\/|db\/|neon_seed\.sql$)/.test(file));
const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /gh[pousr]_[A-Za-z0-9]{30,}/, /AKIA[A-Z0-9]{16}/, /postgres(?:ql)?:\/\/[^\s:'"]+:[^\s@'"]+@/, /(?:JWT_SECRET|CLOUDINARY_API_SECRET|RAZORPAY_KEY_SECRET)[^\n]*\|\|\s*['"][^'"]+['"]/];
const found = files.filter(file => file !== 'scripts/check-secrets.mjs' && patterns.some(pattern => pattern.test(readFileSync(file, 'utf8'))));
if (found.length) { console.error(`Potential source credentials in: ${found.join(', ')}. Values are not printed.`); process.exitCode = 1; }
else console.log('Tracked application/scripts/schema secret-pattern check passed. Provider/history scanning remains an operational task.');
