import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { databaseConfig } from '../../src/lib/databaseConfig.mjs';

test('shared database TLS settings reject untrusted/wrong-host certificates and accept trusted matching TLS', async () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'wishlyn-tls-test-'));
  try {
    for (const name of ['valid', 'wrong']) execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(folder, `${name}.key`), '-out', path.join(folder, `${name}.crt`), '-days', '1', '-subj', `/CN=${name}`, '-addext', `subjectAltName=${name === 'valid' ? 'IP:127.0.0.1' : 'DNS:wrong.example.test'}`], { stdio: 'ignore' });
    async function probe(name: string, trust: boolean): Promise<void> {
      const cert = readFileSync(path.join(folder, `${name}.crt`), 'utf8');
      const key = readFileSync(path.join(folder, `${name}.key`));
      const sockets = new Set<net.Socket>();
      const server = net.createServer(socket => {
        sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => undefined);
        socket.once('data', () => {
          socket.write('S');
          const secure = new tls.TLSSocket(socket, { isServer: true, secureContext: tls.createSecureContext({ key, cert }) });
          secure.on('error', () => undefined);
          secure.once('data', () => {
            // Minimal PostgreSQL startup acknowledgement, sufficient to prove TLS negotiation.
            const authentication = Buffer.alloc(9); authentication.write('R'); authentication.writeInt32BE(8, 1);
            const ready = Buffer.from([90, 0, 0, 0, 5, 73]); secure.write(Buffer.concat([authentication, ready]));
          });
        });
      });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as net.AddressInfo).port;
      const client = new pg.Client({ ...databaseConfig(`postgresql://fixture:fixture@127.0.0.1:${port}/test?sslmode=require`, { NODE_ENV: 'production', ...(trust ? { DATABASE_CA_CERT: cert } : {}) }), connectionTimeoutMillis: 2000 });
      try { await client.connect(); }
      finally { await client.end().catch(() => undefined); for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); }
    }
    await assert.rejects(() => probe('valid', false), /self-signed|certificate/i);
    await assert.rejects(() => probe('wrong', true), /altname|IP|hostname/i);
    await probe('valid', true);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
