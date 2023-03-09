import { Auth0Provider } from '@bcwdev/auth0provider'
import { accountService } from '../services/AccountService'
import { leagueService } from '../services/LeagueService'
import { partyService } from '../services/PartyService'
import { teamService } from '../services/TeamService'
import BaseController from '../utils/BaseController'

export class AccountController extends BaseController {
  constructor() {
    super('account')
    this.router
      .use(Auth0Provider.getAuthorizedUserInfo)
      .get('', this.getUserAccount)
      .get('/myTeams', this.getMyTeams)
      .get('/leagues', this.getMyLeagues)
      .get('/myParties', this.getMyParties)
  }

  async getUserAccount(req, res, next) {
    try {
      const account = await accountService.getAccount(req.userInfo)
      res.send(account)
    } catch (error) {
      next(error)
    }
  }

  async getMyTeams(req, res, next) {
    try {
      const accountId = req.userInfo.id
      const myTeams = await teamService.getMyTeams({ accountId: accountId })
      return res.send(myTeams)
    } catch (error) {
      next(error)
    }
  }

  async getMyParties(req, res, next) {
    try {
      const accountId = req.userInfo.id
      const myParties = await partyService.getMyParties({ accountId: accountId })
      return res.send(myParties)
    } catch (error) {
      next(error)
    }
  }
  
  async getMyLeagues(req, res, next) {
    try {
      const accountId = req.userInfo.id
      const attending = await leagueService.getMyLeagues({ hostId: accountId })
      return res.send(attending)
    } catch (error) {
      next(error)
    }
  }
}
