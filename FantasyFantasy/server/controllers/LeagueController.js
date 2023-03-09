import { Auth0Provider } from "@bcwdev/auth0provider";
import { leagueService } from "../services/LeagueService";
import BaseController from "../utils/BaseController";

export class LeagueController extends BaseController {
  constructor() {
    super('api/leagues')
    this.router
      .use(Auth0Provider.getAuthorizedUserInfo)
      .get('', this.getAllLeagues)
      .post('', this.createLeague)
      .get('/:id', this.getById)
      .put('/:id', this.joinLeague)
      .put('/:id', this.deactivateLeague)
      .delete('/:id', this.deleteLeague)
  }

  async getAllLeagues(req, res, next) {
    try {
      const query = req.query
      const leagues = await leagueService.getAll(query)
      return res.send(leagues)
    } catch (error) {
      next(error)
    }
  }
  async getById(req, res, next) {
    try {
      req.body.id = req.params.id
      const league = await leagueService.getById(req.params.id)
      return res.send(league)
    } catch (error) {
      next(error)
    }
  }
  async createLeague(req, res, next) {
    try {
      req.body.accountId = req.userInfo.id
      const league = await leagueService.createLeague(req.body)
      return res.send(league)
    } catch (error) {
      next(error)
    }
  }

  async joinLeague(req, res, next) {
    try {
      req.body.accountId = req.userInfo.id
      req.body.id = req.params.id
      const league = await leagueService.joinLeague(req.body)
      return res.send(league)
    } catch (error) {
      next(error)
    }
  }

  async editLeague(req, res, next) {
    try {
      req.body.accountId = req.userInfo.id
      req.body.id = req.params.id
      const league = await leagueService.editLeague(req.body)
      return res.send(league)
    } catch (error) {
      next(error)
    }
  }

  async deactivateLeague(req, res, next) {
    try {
      const accountId = req.userInfo.id
      const id = req.params.id
      const deactivatedLeague = await leagueService.deactivateLeague(id, { activeStatus: "Inactive", accountId: accountId })
      return res.send(deactivatedLeague)
    } catch (error) {
      next(error)
    }
  }

  async deleteLeague(req, res, next) {
    try {
      const userId = req.userInfo.id
      const leagueId = req.params.id
      await leagueService.deleteLeague(leagueId, userId)
      res.send('No friends? Go join a league instead.')
    } catch (error) {
      next(error)
    }
  }
  
}