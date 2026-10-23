import { Router, type Request } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { MongoRateLimitStore } from '../../lib/rateLimitStore.js'
import { currentAccount } from '../../middleware/auth.js'
import { parseId } from '../leagues/league.schemas.js'
import { CHAT_MESSAGE_MAX } from './chatMessage.model.js'
import * as chat from './chat.service.js'

export const CHAT_MESSAGES_PER_MINUTE = 10

const PostMessageSchema = z.object({ body: z.string().trim().min(1, 'Write a message first').max(CHAT_MESSAGE_MAX) }).strict()
const ListQuerySchema = z.object({ before: z.string().regex(/^[0-9a-f]{24}$/i).optional() })

/**
 * League chat, mounted at /leagues/:id/chat. Kept off the league router so the app's polling doesn't
 * run the league's draft and week checks every few seconds.
 */
export function chatRouter() {
  const limitPosting = rateLimit({
    windowMs: 60_000,
    limit: CHAT_MESSAGES_PER_MINUTE,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: req => currentAccount(req).id,
    store: new MongoRateLimitStore('chat:'),
    message: { error: { status: 429, message: 'You’re sending messages too quickly, try again in a minute' } }
  })
  return Router({ mergeParams: true })
    .get('/', async (req, res) => {
      const { before } = ListQuerySchema.parse(req.query)
      res.json(await chat.listMessages(currentAccount(req), leagueId(req), before))
    })
    .get('/unread', async (req, res) => {
      res.json(await chat.getUnread(currentAccount(req), leagueId(req)))
    })
    .post('/', limitPosting, async (req, res) => {
      const { body } = PostMessageSchema.parse(req.body)
      res.status(201).json(await chat.postMessage(currentAccount(req), leagueId(req), body))
    })
    .delete('/:messageId', async (req, res) => {
      await chat.deleteMessage(currentAccount(req), leagueId(req), parseId(req.params.messageId))
      res.status(204).end()
    })
    .post('/:messageId/report', async (req, res) => {
      res.json(await chat.reportMessage(currentAccount(req), leagueId(req), parseId(req.params.messageId)))
    })
}

/** The league id from the parent route (mergeParams), which Express's types don't carry over. */
function leagueId(req: Request): string {
  const { id } = req.params as Record<string, unknown>
  return parseId(typeof id === 'string' ? id : undefined)
}
