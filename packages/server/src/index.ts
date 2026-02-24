import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { getDb } from './db';
import { initWebSocket } from './ws/handler';
import { logger } from './logger';
import agentRoutes from './routes/agents';
import conversationRoutes from './routes/conversations';
import activityRoutes from './routes/activity';
import approvalRoutes from './routes/approvals';

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

// Routes
app.use('/api/agents', agentRoutes);
app.use('/api', conversationRoutes);
app.use('/api/agents', activityRoutes);
app.use('/api/approvals', approvalRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// Initialize database
getDb();
logger.info('Database initialized');

// Initialize WebSocket
initWebSocket(server);
logger.info('WebSocket server ready');

// Start
server.listen(PORT, () => {
  logger.info('Vault server running on http://localhost:%d', PORT);
});
