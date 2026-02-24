import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDb } from './db';
import { logger } from './logger';

const TOKEN_EXPIRY = '7d';

/**
 * Get or generate the server secret used for JWT signing and password validation.
 * Priority: HANDLER_SECRET env var > stored secret in DB > auto-generated.
 */
export function getSecret(): string {
  // 1. Environment variable takes priority
  if (process.env.HANDLER_SECRET) {
    return process.env.HANDLER_SECRET;
  }

  // 2. Check DB for a stored secret
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('server_secret') as
    | { value: string }
    | undefined;

  if (row) {
    return row.value;
  }

  // 3. Generate a new secret and store it
  const secret = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('server_secret', secret);

  logger.info('──────────────────────────────────────────────');
  logger.info('  No HANDLER_SECRET set. Generated a new one.');
  logger.info('  Your login password: %s', secret);
  logger.info('  Set HANDLER_SECRET env var to use your own.');
  logger.info('──────────────────────────────────────────────');

  return secret;
}

let _secret: string | null = null;

function secret(): string {
  if (!_secret) {
    _secret = getSecret();
  }
  return _secret;
}

/**
 * Create a JWT for an authenticated session.
 */
export function createToken(): string {
  return jwt.sign({ role: 'admin' }, secret(), { expiresIn: TOKEN_EXPIRY });
}

/**
 * Verify a JWT and return the payload, or null if invalid.
 */
export function verifyToken(token: string): jwt.JwtPayload | null {
  try {
    const payload = jwt.verify(token, secret());
    return typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Login handler: POST /api/auth/login
 * Body: { password: string }
 */
export function handleLogin(req: Request, res: Response) {
  const { password } = req.body;

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required' });
  }

  // Compare against the secret using timing-safe comparison
  const expected = Buffer.from(secret());
  const received = Buffer.from(password);

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = createToken();
  res.json({ token });
}

/**
 * Verify auth status: GET /api/auth/verify
 */
export function handleVerify(req: Request, res: Response) {
  // If this endpoint is reached, the token is already valid (middleware passed)
  res.json({ valid: true });
}

/**
 * Express middleware: require a valid JWT on all protected routes.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = header.slice(7);
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  next();
}

/**
 * Verify a WebSocket upgrade request has a valid token.
 * Token is passed as ?token=<jwt> query parameter.
 */
export function verifyWsToken(url: string): boolean {
  try {
    const parsed = new URL(url, 'http://localhost');
    const token = parsed.searchParams.get('token');
    if (!token) return false;
    return verifyToken(token) !== null;
  } catch {
    return false;
  }
}
