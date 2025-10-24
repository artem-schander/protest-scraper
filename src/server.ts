import 'dotenv/config';
import { connectToDatabase, closeConnection } from '@/db/connection.js';
import { createApp } from '@/app.js';

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
