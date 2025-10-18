import { MongoClient, Db } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectToDatabase(): Promise<Db> {
  if (db) {
    return db;
  }

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/protest-scraper';

  try {
    client = new MongoClient(uri);
    await client.connect();

    db = client.db();

    console.log('✅ Connected to MongoDB');

    // Initialize indexes
    await initializeIndexes(db);

    return db;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

async function initializeIndexes(database: Db): Promise<void> {
  try {
    // Protests collection indexes
    const protests = database.collection('protests');

    await protests.createIndex({ city: 1 });
    await protests.createIndex({ country: 1 });
    await protests.createIndex({ verified: 1 });
    await protests.createIndex({ source: 1 });
    await protests.createIndex({ language: 1 });
    await protests.createIndex({ city: 1, start: 1 });

    // Geospatial index for location-based queries (GeoJSON format)
    await protests.createIndex({ geoLocation: '2dsphere' }, { sparse: true });

    // TTL index on start field: automatically delete protests 2 weeks (14 days) after they took place
    // Drop existing start_1 index if it exists without TTL option
    try {
      const indexes = await protests.indexes();
      const startIndex = indexes.find(idx => idx.name === 'start_1');
      if (startIndex && !startIndex.expireAfterSeconds) {
        console.log('Dropping old start_1 index to recreate with TTL...');
        await protests.dropIndex('start_1');
      }
    } catch (e) {
      // Index doesn't exist, that's fine
    }

    // Create or update TTL index
    await protests.createIndex(
      { start: 1 },
      { expireAfterSeconds: 14 * 24 * 60 * 60 } // 14 days in seconds
    );

    // Users collection indexes
    const users = database.collection('users');
    await users.createIndex({ email: 1 }, { unique: true });

    console.log('✅ Database indexes created');
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
    throw error;
  }
}

export async function closeConnection(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('✅ MongoDB connection closed');
  }
}

export function getDatabase(): Db {
  if (!db) {
    throw new Error('Database not initialized. Call connectToDatabase() first.');
  }
  return db;
}
