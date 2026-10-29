import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { databaseConfig } from '../../src/lib/databaseConfig.mjs';

const source = ts.transpileModule(readFileSync(new URL('./merchant.test.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
for (const suffix of ['?host=remote.invalid', '?port=9999', '?ssl=0', '?sslmode=require&sslmode=disable']) test(`merchant fixture rejects ${suffix} before creating a client or database`, async () => {
  const before = []; let clients = 0;
  class Client { constructor() { clients++; } async connect() { throw new Error('Network operation attempted'); } }
  const testApi = { test() {}, describe(_name, _options, run) { run(); }, before(fn) { before.push(fn); }, beforeEach() {}, after() {} };
  const context = { exports: {}, URL, process: { env: { MERCHANT_TEST_DATABASE_URL: `postgresql://fixture:fixture@127.0.0.1:5432/wishlyn_test${suffix}` } }, require: name => name === 'node:assert/strict' ? assert : name === 'node:crypto' ? { randomUUID } : name === 'node:test' ? testApi : name === 'pg' ? { __esModule: true, default: { Client } } : name === '../../src/lib/databaseConfig.mjs' ? { databaseConfig } : {} };
  vm.runInNewContext(source, context);
  assert.equal(before.length, 1);
  await assert.rejects(before[0](), /Unsupported|repeated/);
  assert.equal(clients, 0, 'URL validation must happen before any connection or DDL');
});
