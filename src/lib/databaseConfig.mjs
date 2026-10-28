/**
 * Shared by runtime and scripts; never relax remote certificate verification.
 * @param {string | undefined} connectionString
 * @param {Record<string, string | undefined>} env
 */
export function databaseConfig(connectionString, env = process.env) {
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Unsupported database URL.');
  const mode = url.searchParams.get('sslmode');
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  const plaintext = local && env.NODE_ENV !== 'production' && env.DB_ALLOW_LOCAL_PLAINTEXT === 'true';
  if (['no-verify', 'allow', 'prefer'].includes(mode) || (mode === 'disable' && !plaintext)) throw new Error('Database TLS verification cannot be disabled.');
  // pg URL SSL parameters otherwise replace the explicit verified TLS object.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  return { connectionString: url.toString(), ssl: plaintext ? false : { rejectUnauthorized: true, ...(env.DATABASE_CA_CERT ? { ca: env.DATABASE_CA_CERT } : {}) } };
}
