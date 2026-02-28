import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { getDb } from './db';
import { initWebSocket } from './ws/handler';
import { initAgentWebSocket } from './ws/agent-handler';
import { logger } from './logger';
import { requireAuth, handleLogin, handleVerify, getSecret } from './auth';
import agentRoutes from './routes/agents';
import conversationRoutes from './routes/conversations';
import activityRoutes from './routes/activity';
import approvalRoutes from './routes/approvals';

// Clean Claude Code env vars so child processes (claude CLI) don't think they're nested
delete process.env.CLAUDECODE;
delete process.env.CLAUDE_CODE_SESSION;

// ─── Environment Validation ─────────────────────────────────────────
const API_KEY_VARS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY'];
const configuredKeys = API_KEY_VARS.filter((k) => !!process.env[k]);

if (configuredKeys.length === 0) {
  logger.warn('──────────────────────────────────────────────');
  logger.warn('  No LLM API keys configured!');
  logger.warn('  Set at least one in your .env file:');
  logger.warn('    ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY');
  logger.warn('  Agents will fail until a valid key is provided.');
  logger.warn('──────────────────────────────────────────────');
} else {
  logger.info('API keys configured: %s', configuredKeys.join(', '));
}

const PORT = parseInt(process.env.PORT || '3001', 10);

const app = express();
const server = createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting — login endpoint (strict)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting — general API (generous)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute
  message: { error: 'Rate limit exceeded. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Request logging (skip static files)
app.use((req, _res, next) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/ws')) {
    logger.info('%s %s', req.method, req.url);
  }
  next();
});

// Public routes (no auth required)
app.post('/api/auth/login', loginLimiter, handleLogin);
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// Auth middleware — everything below requires a valid JWT
app.use('/api', apiLimiter, requireAuth);

// Auth verification (protected — if you reach it, your token is valid)
app.get('/api/auth/verify', handleVerify);

// Protected routes
app.use('/api/agents', agentRoutes);
app.use('/api', conversationRoutes);
app.use('/api/agents', activityRoutes);
app.use('/api/approvals', approvalRoutes);

// ─── Serve Client Static Files ──────────────────────────────────────
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback — serve index.html for any non-API route
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  logger.info('Serving client from %s', clientDist);
} else {
  logger.warn('Client build not found at %s — run "npm run build" in packages/client', clientDist);
}

// Initialize database and auth
getDb();
logger.info('Database initialized');
getSecret(); // Ensures secret is generated/loaded on startup

// Initialize WebSocket
initWebSocket(server);
initAgentWebSocket(server);
logger.info('WebSocket server ready (client + agent)');

// Start
server.listen(PORT, '0.0.0.0', () => {
  logger.info('Handler server running on http://0.0.0.0:%d', PORT);
});
