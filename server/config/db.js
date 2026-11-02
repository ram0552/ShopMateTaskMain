const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGO_URI;
const dbName = 'shopmate';

let client;
let db;

const connectDB = async () => {
  if (db) return db;

  if (!uri) {
    throw new Error('MONGO_URI is not configured');
  }

  try {
    client = new MongoClient(uri);
    await client.connect();

    db = client.db(dbName);

    await db.collection('orders').createIndex(
      { userId: 1, idempotencyKey: 1 },
      {
        unique: true,
        partialFilterExpression: {
          idempotencyKey: { $type: 'string' }
        }
      }
    );

    await db.collection('orders').createIndex({
      userId: 1,
      createdAt: -1
    });

    await db.collection('users').createIndex(
      { email: 1 },
      { unique: true }
    );

    console.log('MongoDB Connected Successfully');
    return db;
  } catch (error) {
    console.error('MongoDB Connection Failed:', error);
    throw error;
  }
};

const getDB = () => {
  if (!db) {
    throw new Error('Database not initialized. Call connectDB first.');
  }

  return db;
};

const getClient = () => {
  if (!client) {
    throw new Error('MongoDB client not initialized');
  }

  return client;
};

const closeDB = async () => {
  if (client) {
    await client.close();
    client = undefined;
    db = undefined;
  }
};

module.exports = { connectDB, getDB, getClient, closeDB };
