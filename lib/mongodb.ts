import { MongoClient } from 'mongodb'

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined
}

export default function getMongoClient() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not configured')
  const client = new MongoClient(uri, {
    tls: true,
    family: 4,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  })
  if (!global._mongoClientPromise) {
    const promise = client.connect().catch((error) => {
      global._mongoClientPromise = undefined
      throw error
    })
    if (process.env.NODE_ENV !== 'production') global._mongoClientPromise = promise
    return promise
  }

  return global._mongoClientPromise
}
