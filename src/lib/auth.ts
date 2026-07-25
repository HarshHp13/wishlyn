import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'wishlyn-fine-jewellery-secret-key-2026';
const EXPIRES_IN = '7d';

export interface UserTokenPayload {
  id: string;
  email: string;
  role: 'customer' | 'admin';
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: UserTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): UserTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as UserTokenPayload;
    if (decoded && decoded.id && decoded.email && decoded.role) {
      return decoded;
    }
    return null;
  } catch (err) {
    return null;
  }
}
