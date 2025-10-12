import 'dotenv/config';
import { connectToDatabase, closeConnection } from './db/connection.js';
import { createApp } from './app.js';

const app = createApp();
const PORT = process.env.PORT || 3000;

// Start server
async function startServer(): Promise<void> {
  try {
    await connectToDatabase();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 API: http://localhost:${PORT}`);
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
