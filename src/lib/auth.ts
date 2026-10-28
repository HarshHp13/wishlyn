import bcrypt from 'bcryptjs';
import { ApiError } from './api';

export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw new ApiError(400, 'invalid_email', 'Enter a valid email address.');
  const trimmed = value.trim();
  if (!/^[\x21-\x7e]+$/.test(trimmed)) throw new ApiError(400, 'invalid_email', 'Enter a valid email address.');
  const email = trimmed.toLowerCase();
  const [local, domain, extra] = email.split('@');
  if (email.length > 254 || !local || local.length > 64 || extra !== undefined ||
      !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..') ||
      !domain || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain)) throw new ApiError(400, 'invalid_email', 'Enter a valid email address.');
  return email;
}
// Existing bcrypt accounts may have used >72 bytes. Preserve bounded login
// compatibility; newly chosen credentials always reject truncation.
export function validatePassword(value: unknown, signup = false): string {
  if (typeof value !== 'string' || value.length < (signup ? 8 : 1) || Buffer.byteLength(value, 'utf8') > (signup ? 72 : 1024)) throw new ApiError(400, 'invalid_password', signup ? 'Use a password of at least 8 characters and at most 72 UTF-8 bytes.' : 'Enter a valid password.');
  return value;
}
export function hashPassword(password: string): Promise<string> { return bcrypt.hash(password, 12); }
export function comparePassword(password: string, hash: string): Promise<boolean> { return bcrypt.compare(password, hash); }
