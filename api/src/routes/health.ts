import { Router } from 'express'
import mongoose from 'mongoose'

export const healthRouter = Router().get('/', (_req, res) => {
  const dbUp = mongoose.connection.readyState === mongoose.ConnectionStates.connected
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down' })
})
