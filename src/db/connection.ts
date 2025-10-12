import { MongoClient, Db } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectToDatabase(): Promise<Db> {
  if (db) {
    return db;
  }

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/protest-service';

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
    await protests.createIndex({ start: 1 });
    await protests.createIndex({ verified: 1 });
    await protests.createIndex({ source: 1 });
    await protests.createIndex({ language: 1 });
    await protests.createIndex({ city: 1, start: 1 });

    // Geospatial index for location-based queries (GeoJSON format)
    await protests.createIndex({ geoLocation: '2dsphere' }, { sparse: true });

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
