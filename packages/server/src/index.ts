import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import express from 'express';
import cors from 'cors';
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

const PORT = parseInt(process.env.PORT || '3001', 10);

const app = express();
const server = createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  logger.info('%s %s', req.method, req.url);
  next();
});

// Public routes (no auth required)
app.post('/api/auth/login', handleLogin);
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// Auth middleware — everything below requires a valid JWT
app.use('/api', requireAuth);

// Auth verification (protected — if you reach it, your token is valid)
app.get('/api/auth/verify', handleVerify);

// Protected routes
app.use('/api/agents', agentRoutes);
app.use('/api', conversationRoutes);
app.use('/api/agents', activityRoutes);
app.use('/api/approvals', approvalRoutes);

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
  logger.info('Vault server running on http://0.0.0.0:%d', PORT);
});
