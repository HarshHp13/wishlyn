/**
 * Shared by runtime and scripts. Parse once into explicit pg options: a second
 * connection-string parse must never override the validated host or transport.
 * @param {string | undefined} connectionString
 * @param {Record<string, string | undefined>} env
 */
export function databaseConfig(connectionString, env = process.env) {
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash) throw new Error('Unsupported database URL.');
  const allowed = new Set(['sslmode', 'application_name']);
  const seen = new Set();
  for (const [key] of url.searchParams) {
    if (!allowed.has(key) || seen.has(key)) throw new Error('Unsupported or repeated database URL option. Use explicit environment configuration.');
    seen.add(key);
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const database = decodeURIComponent(url.pathname.slice(1));
  const port = url.port ? Number(url.port) : 5432;
  if (!host || /[%/\s]/u.test(host) || !user || !password || !database || /[\u0000-\u001f\u007f]/u.test(user + password + database) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Database URL requires an explicit valid host, credentials and database.');
  const mode = url.searchParams.get('sslmode');
  if (mode && !['require', 'verify-ca', 'verify-full', 'disable'].includes(mode)) throw new Error('Unsupported database TLS mode.');
  const local = ['127.0.0.1', 'localhost', '::1'].includes(host);
  const plaintext = local && env.NODE_ENV !== 'production' && env.DB_ALLOW_LOCAL_PLAINTEXT === 'true' && (!mode || mode === 'disable');
  if (mode === 'disable' && !plaintext) throw new Error('Database TLS verification cannot be disabled.');
  const applicationName = url.searchParams.get('application_name') || 'wishlyn';
  if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(applicationName)) throw new Error('Invalid database application name.');
  return {
    host, port, user, password, database,
    application_name: applicationName,
    sslnegotiation: 'postgres',
    ssl: plaintext ? false : { rejectUnauthorized: true, ...(env.DATABASE_CA_CERT ? { ca: env.DATABASE_CA_CERT } : {}) },
  };
}
