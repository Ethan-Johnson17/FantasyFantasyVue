import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { currentAccount } from '../../middleware/auth.js'
import {
  CreateLeagueSchema,
  JoinLeagueSchema,
  PageQuerySchema,
  parseId,
  PinSchema,
  UpdateLeagueSchema,
  UpdatePartySchema
} from './league.schemas.js'
import * as leagues from './league.service.js'

export const PIN_ATTEMPTS_PER_MINUTE = 20

/** Slows PIN guessing: limits PIN lookups and joins per account, on top of the global limit. */
const pinLimiter = () =>
  rateLimit({
    windowMs: 60_000,
    limit: PIN_ATTEMPTS_PER_MINUTE,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: req => currentAccount(req).id,
    message: { error: { status: 429, message: 'Too many attempts, try again in a minute' } }
  })

export function leagueRouter() {
  const limitPinAttempts = pinLimiter()
  return Router()
    .post('/', async (req, res) => {
      res.status(201).json(await leagues.createLeague(currentAccount(req), CreateLeagueSchema.parse(req.body)))
    })
    .get('/mine', async (req, res) => {
      res.json(await leagues.listMyLeagues(currentAccount(req)))
    })
    .get('/public', async (req, res) => {
      const { page } = PageQuerySchema.parse(req.query)
      res.json(await leagues.listPublicLeagues(currentAccount(req), page))
    })
    .get('/pin/:pin', limitPinAttempts, async (req, res) => {
      res.json(await leagues.previewLeagueByPin(currentAccount(req), PinSchema.parse(req.params.pin)))
    })
    .post('/join', limitPinAttempts, async (req, res) => {
      const { pin, party } = JoinLeagueSchema.parse(req.body)
      res.status(201).json(await leagues.joinLeague(currentAccount(req), pin, party))
    })
    .get('/:id', async (req, res) => {
      res.json(await leagues.getLeague(currentAccount(req), parseId(req.params.id)))
    })
    .patch('/:id', async (req, res) => {
      const update = UpdateLeagueSchema.parse(req.body)
      res.json(await leagues.updateLeague(currentAccount(req), parseId(req.params.id), update))
    })
    .post('/:id/cancel', async (req, res) => {
      res.json(await leagues.cancelLeague(currentAccount(req), parseId(req.params.id)))
    })
    .post('/:id/leave', async (req, res) => {
      await leagues.leaveLeague(currentAccount(req), parseId(req.params.id))
      res.status(204).end()
    })
    .delete('/:id/parties/:partyId', async (req, res) => {
      const leagueId = parseId(req.params.id)
      res.json(await leagues.removeParty(currentAccount(req), leagueId, parseId(req.params.partyId)))
    })
}

export const partyRouter = Router().patch('/:id', async (req, res) => {
  const update = UpdatePartySchema.parse(req.body)
  res.json(await leagues.updateParty(currentAccount(req), parseId(req.params.id), update))
})
