// const { MongoClient } = require('mongodb');
// require('dotenv').config();

// const uri = process.env.MONGO_URI ;
// const dbName = 'shopmate';

// let db;

// const connectDB = async () => {
//   if (db) return db;
//   try {
//     const client = new MongoClient(uri);
//     await client.connect();
//     console.log('MongoDB Connected Successfully');
//     db = client.db(dbName);
//     return db;
//   } catch (error) {
//     console.error('MongoDB Connection Failed:', error);
//     process.exit(1);
//   }
// };

// const getDB = () => {
//   if (!db) {
//     throw new Error('Database not initialized. Call connectDB first.');
//   }
//   return db;
// };

// module.exports = { connectDB, getDB };



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

module.exports = { connectDB, getDB, getClient };
