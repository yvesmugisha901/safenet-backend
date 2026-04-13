import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.routes';
import emergencyRoutes from './routes/emergency.routes';
import resourceRoutes from './routes/resource.routes';
import notificationRoutes from './routes/notification.routes';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();
const server = http.createServer(app);

// ── Socket.io ────────────────────────────────────────────────
export const io = new SocketServer(server, {
  cors: { origin: process.env.FRONTEND_URL, methods: ['GET', 'POST'] },
});

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('join_room', (room: string) => socket.join(room));

  socket.on('disconnect', () =>
    console.log(`❌ Client disconnected: ${socket.id}`)
  );
});

// ── Middleware ───────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());

// ── Routes ───────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    status: '🚀 SafeNet API is running',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      emergencies: '/api/emergencies',
      resources: '/api/resources',
      notifications: '/api/notifications',
      health: '/api/health',
    }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/emergencies', emergencyRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'OK', time: new Date() }));

// ── Error Handler ────────────────────────────────────────────
app.use(errorHandler);

// ── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 SafeNet server running on port ${PORT}`));