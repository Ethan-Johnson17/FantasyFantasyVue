import mongoose from 'mongoose'
import { afterAll, afterEach, beforeAll, inject } from 'vitest'
import { configureMongoose } from '../src/db/mongoose.js'

beforeAll(async () => {
  configureMongoose()
  await mongoose.connect(inject('mongoUri'), { dbName: 'test' })
  await mongoose.connection.syncIndexes()
})

afterEach(async () => {
  const collections = await mongoose.connection.db?.collections()
  await Promise.all((collections ?? []).map(collection => collection.deleteMany({})))
})

afterAll(async () => {
  await mongoose.disconnect()
})
