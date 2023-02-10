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
  }

  getAllLeagues(req, res, next) {
    throw new Error("Method not implemented.");
  }
  getById(req, res, next) {
    throw new Error("Method not implemented.");
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
  
}