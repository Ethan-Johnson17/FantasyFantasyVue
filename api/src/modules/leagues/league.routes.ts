import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { MongoRateLimitStore } from '../../lib/rateLimitStore.js'
import { currentAccount } from '../../middleware/auth.js'
import * as draft from '../draft/draft.service.js'
import * as roster from '../roster/roster.service.js'
import { advanceLeague } from '../season/advance.js'
import { getFinale } from '../season/finale.service.js'
import { getMatchup } from '../season/matchup.service.js'
import { getPlayoffs } from '../season/playoffs.service.js'
import * as season from '../season/season.service.js'
import {
  ChampionSchema,
  ClaimSchema,
  CreateLeagueSchema,
  HideLeagueSchema,
  JoinLeagueSchema,
  LineupSchema,
  MatchupQuerySchema,
  PageQuerySchema,
  parseId,
  PinSchema,
  KeepersSchema,
  QuestPartySchema,
  RankingsSchema,
  ScheduleDraftSchema,
  ConfirmSoloSchema,
  StartSoloSchema,
  SwapSchema,
  UpdateLeagueSchema,
  UpdatePartySchema,
  WeekParamSchema
} from './league.schemas.js'
import * as dynasty from '../dynasty/dynasty.service.js'
import * as leagues from './league.service.js'
import type { CreateOptions } from './league.service.js'
import { getCampaign } from '../season/campaign.service.js'
import * as solo from '../solo/solo.service.js'
import type { SoloOptions } from '../solo/solo.service.js'

export const PIN_ATTEMPTS_PER_MINUTE = 20

/** Slows PIN guessing: limits PIN lookups and joins per account, on top of the global limit. */
const pinLimiter = () =>
  rateLimit({
    windowMs: 60_000,
    limit: PIN_ATTEMPTS_PER_MINUTE,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: req => currentAccount(req).id,
    store: new MongoRateLimitStore('pin:'),
    message: { error: { status: 429, message: 'Too many attempts, try again in a minute' } }
  })

export function leagueRouter(modes: CreateOptions & SoloOptions) {
  const limitPinAttempts = pinLimiter()
  return Router()
    // Every /:id route first brings the league up to date (runs a due draft, resolves due weeks).
    .param('id', (_req, _res, next, id: string) => {
      advanceLeague(parseId(id)).then(() => {
        next()
      }, next)
    })
    .post('/', async (req, res) => {
      res.status(201).json(await leagues.createLeague(currentAccount(req), CreateLeagueSchema.parse(req.body), modes))
    })
    // Solo (docs/SOLO_SPEC.md): a private run for one party, started on its own rather than hosted
    .post('/solo', async (req, res) => {
      const { party } = StartSoloSchema.parse(req.body)
      const id = await solo.startRun(currentAccount(req), party, modes)
      // Fill the pool now, so the run opens ready to build.
      await advanceLeague(id)
      res.status(201).json(await leagues.getLeague(currentAccount(req), id))
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
      const { pin, party, takeOver } = JoinLeagueSchema.parse(req.body)
      res.status(201).json(await leagues.joinLeague(currentAccount(req), pin, party, takeOver))
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
    .put('/:id/hidden', async (req, res) => {
      const { hidden } = HideLeagueSchema.parse(req.body)
      await leagues.setLeagueHidden(currentAccount(req), parseId(req.params.id), hidden)
      res.status(204).end()
    })
    .post('/:id/leave', async (req, res) => {
      await leagues.leaveLeague(currentAccount(req), parseId(req.params.id))
      res.status(204).end()
    })
    .delete('/:id/parties/:partyId', async (req, res) => {
      const leagueId = parseId(req.params.id)
      res.json(await leagues.removeParty(currentAccount(req), leagueId, parseId(req.params.partyId)))
    })
    .post('/:id/draft', async (req, res) => {
      const leagueId = parseId(req.params.id)
      const { draftAt } = ScheduleDraftSchema.parse(req.body)
      await draft.scheduleDraft(currentAccount(req), leagueId, draftAt)
      res.json(await leagues.getLeague(currentAccount(req), leagueId))
    })
    .get('/:id/heroes', async (req, res) => {
      res.json(await draft.listHeroes(currentAccount(req), parseId(req.params.id)))
    })
    .get('/:id/heroes/:heroId', async (req, res) => {
      const leagueId = parseId(req.params.id)
      res.json(await season.getHeroDetail(currentAccount(req), leagueId, parseId(req.params.heroId)))
    })
    .get('/:id/rankings', async (req, res) => {
      res.json(await draft.getRankings(currentAccount(req), parseId(req.params.id)))
    })
    .put('/:id/rankings', async (req, res) => {
      const { heroIds } = RankingsSchema.parse(req.body)
      res.json(await draft.setRankings(currentAccount(req), parseId(req.params.id), heroIds))
    })
    .get('/:id/lineup', async (req, res) => {
      res.json(await season.getLineup(currentAccount(req), parseId(req.params.id)))
    })
    .put('/:id/lineup', async (req, res) => {
      const lineup = LineupSchema.parse(req.body)
      res.json(await season.setLineup(currentAccount(req), parseId(req.params.id), lineup))
    })
    .post('/:id/next-season', async (req, res) => {
      const nextId = await dynasty.startNextSeason(currentAccount(req), parseId(req.params.id))
      res.status(201).json(await leagues.getLeague(currentAccount(req), nextId))
    })
    .get('/:id/dynasty', async (req, res) => {
      res.json(await dynasty.getDynasty(currentAccount(req), parseId(req.params.id)))
    })
    .get('/:id/keepers', async (req, res) => {
      res.json(await dynasty.getKeepers(currentAccount(req), parseId(req.params.id)))
    })
    .put('/:id/keepers', async (req, res) => {
      const { heroIds } = KeepersSchema.parse(req.body)
      res.json(await dynasty.setKeepers(currentAccount(req), parseId(req.params.id), heroIds))
    })
    .put('/:id/quest-party', async (req, res) => {
      const { heroIds } = QuestPartySchema.parse(req.body)
      res.json(await season.setQuestParty(currentAccount(req), parseId(req.params.id), heroIds))
    })
    .put('/:id/champion', async (req, res) => {
      const { heroId } = ChampionSchema.parse(req.body)
      res.json(await season.setChampion(currentAccount(req), parseId(req.params.id), heroId))
    })
    .post('/:id/claims', async (req, res) => {
      const { heroId, dropHeroId } = ClaimSchema.parse(req.body)
      res.json(await roster.claimFreeAgent(currentAccount(req), parseId(req.params.id), heroId, dropHeroId))
    })
    .get('/:id/moves', async (req, res) => {
      res.json(await roster.listMoves(currentAccount(req), parseId(req.params.id)))
    })
    .get('/:id/matchup', async (req, res) => {
      const { week } = MatchupQuerySchema.parse(req.query)
      res.json(await getMatchup(currentAccount(req), parseId(req.params.id), week))
    })
    .get('/:id/schedule', async (req, res) => {
      res.json(await season.getSchedule(currentAccount(req), parseId(req.params.id)))
    })
    .get('/:id/results/:week', async (req, res) => {
      const week = WeekParamSchema.parse(req.params.week)
      res.json(await season.getWeekResult(currentAccount(req), parseId(req.params.id), week))
    })
    .get('/:id/solo', async (req, res) => {
      res.json(await solo.getSolo(currentAccount(req), parseId(req.params.id)))
    })
    .post('/:id/solo/confirm', async (req, res) => {
      const leagueId = parseId(req.params.id)
      await solo.confirmRun(currentAccount(req), leagueId, ConfirmSoloSchema.parse(req.body))
      res.json(await solo.getSolo(currentAccount(req), leagueId))
    })
    .post('/:id/solo/swaps', async (req, res) => {
      const leagueId = parseId(req.params.id)
      const { releaseHeroId, signHeroId } = SwapSchema.parse(req.body)
      await solo.swapHero(currentAccount(req), leagueId, releaseHeroId, signHeroId)
      res.json(await solo.getSolo(currentAccount(req), leagueId))
    })
    .get('/:id/campaign', async (req, res) => {
      res.json(await getCampaign(currentAccount(req), parseId(req.params.id)))
    })
    .get('/:id/finale', async (req, res) => {
      res.json(await getFinale(currentAccount(req), parseId(req.params.id)))
    })
    .get('/:id/standings', async (req, res) => {
      res.json(await season.getStandings(currentAccount(req), parseId(req.params.id)))
    })
    .get('/:id/playoffs', async (req, res) => {
      res.json(await getPlayoffs(currentAccount(req), parseId(req.params.id)))
    })
}

export const partyRouter = Router().patch('/:id', async (req, res) => {
  const update = UpdatePartySchema.parse(req.body)
  res.json(await leagues.updateParty(currentAccount(req), parseId(req.params.id), update))
})
