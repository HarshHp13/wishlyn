import { spawn } from 'node:child_process';

// Mandatory suites must never become a green release gate by silently skipping their database cases.
const databases = ['TEST_DATABASE_URL', 'COMMERCE_TEST_DATABASE_URL', 'STOREFRONT_TEST_DATABASE_URL', 'MERCHANT_TEST_DATABASE_URL', 'ACCOUNT_SERVICE_TEST_DATABASE_URL'];
for (const name of databases) {
  if (!process.env[name]) {
    console.error(`${name} is required for complete verification. Use the documented disposable fixture setup.`);
    process.exit(1);
  }
}
const commands = [
  ['test'], ['run', 'lint'], ['run', 'typecheck'], ['run', 'check:secrets'], ['run', 'build'],
  ['audit', '--omit=dev', '--audit-level=moderate'],
];
for (const args of commands) {
  const status = await new Promise((resolve, reject) => {
    const child = spawn('npm', args, { stdio: 'inherit', env: process.env });
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve(signal ? 1 : code ?? 1));
  });
  if (status !== 0) process.exit(Number(status));
}
