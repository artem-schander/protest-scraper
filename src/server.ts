import 'dotenv/config';
import { WebSocketServer } from 'ws';
import { connectToDatabase, closeConnection } from '@/db/connection.js';
import { createApp } from '@/app.js';
import { ModerationWebSocketService } from '@/services/moderation-websocket.js';
import { setModerationWebSocket } from '@/services/moderation-websocket-instance.js';

const app = createApp();
const PORT = process.env.PORT || 3000;

// Start server
async function startServer(): Promise<void> {
  try {
    await connectToDatabase();

    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 API: http://localhost:${PORT}`);
    });

    // Create WebSocket server on same port as HTTP server
    const wss = new WebSocketServer({
      server,
      path: '/ws/moderation'
    });

    // Initialize moderation WebSocket service
    const moderationWs = new ModerationWebSocketService(wss);
    setModerationWebSocket(moderationWs); // Set singleton instance
    console.log(`🔌 WebSocket server running on ws://localhost:${PORT}/ws/moderation`);

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        console.error(`💡 Try: lsof -ti:${PORT} | xargs kill`);
        process.exit(1);
      } else {
        console.error('Server error:', error);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏳ Shutting down gracefully...');
  await closeConnection();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⏳ Shutting down gracefully...');
  await closeConnection();
  process.exit(0);
});

startServer();
