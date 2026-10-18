import 'dotenv/config';
import http from 'http';
import mongoose from 'mongoose';
import { Server } from 'socket.io';

import app from './src/app.js';
import connectDB from './src/config/db.js';
import { socketAuth } from './src/sockets/socketAuth.js';
import chatHandler from './src/sockets/chatHandler.js';
import callHandler from './src/sockets/callHandler.js';
import roomHandler from './src/sockets/roomHandler.js';
import { markOnline, markOffline } from './src/sockets/presence.js';
import User from './src/models/User.js';

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(','),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.set('io', io);
io.use(socketAuth);
io.on('connection', (socket) => {
  socket.join(`user:${socket.user.id}`);
  markOnline(socket.user.id);
  // يُسجَّل أولاً كي يرى بقية المعالجات حالة الاتصال المحدَّثة عند الانقطاع
  socket.on('disconnect', () => {
    markOffline(socket.user.id);
    User.updateOne({ _id: socket.user.id }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
  });
  chatHandler(io, socket);
  callHandler(io, socket);
  roomHandler(io, socket);
});

const startServer = async () => {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
};

const shutdown = (signal) => {
  console.log(`${signal} received: closing server`);
  server.close(async () => {
    await mongoose.connection.close(false);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => console.error('UNHANDLED REJECTION:', err));

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
