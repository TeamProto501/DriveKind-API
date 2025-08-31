import * as nodeCrypto from 'crypto';

export function hashPassword(password) {
  const salt = nodeCrypto.randomBytes(16).toString('hex');
  const hash = nodeCrypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, hashed) {
  if (!hashed) return false;
  const [salt, hash] = hashed.split(':');
  const hashedAttempt = nodeCrypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === hashedAttempt;
}
