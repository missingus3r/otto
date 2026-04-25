import mongoose from 'mongoose';

export async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not set');
  }
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log('[db] connected to MongoDB');
  } catch (err) {
    console.error('[db] connection failed:', err.message);
    throw err;
  }
}

export default mongoose;
