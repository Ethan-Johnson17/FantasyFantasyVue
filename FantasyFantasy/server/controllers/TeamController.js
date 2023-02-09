import { Auth0Provider } from '@bcwdev/auth0provider'
import { teamService } from "../services/TeamService";
import BaseController from "../utils/BaseController";


export class TeamController extends BaseController {
  constructor() {
    super('api/teams')
    this.router
    .get('', this.getAllTeams)
    .use(Auth0Provider.getAuthorizedUserInfo)
    .get('/:id', this.getTeamById) 
    .post('', this.createTeam)
    .put('/:id', this.editTeam)
  }

  async getAllTeams(req, res, next) {
    try {
      const query = req.query
      const team = await teamService.getAllTeams(query)
      return res.send(team)
    } catch (error) {
      next(error)
    }
  }

  async getTeamById(req, res, next) {
    try {
      let team = await teamService.getTeamById(req.params.id);
      return res.send(team)
    } catch (error) {
      next(error)
    }
  }
  async createTeam(req, res, next) {
    try {
      req.body.accountId = req.userInfo.id
      const team = await teamService.createTeam(req.body)
      return res.send(team)
    } catch (error) {
      next(error)
    }
  }

  async editTeam(req, res, next) {
    try {
      const id = req.params.id
      const team = req.body
      team._id = id
      const updatedTeam = await teamService.editTeam(id, team)
      return res.send(updatedTeam)
    } catch (error) {
      next(error)
    }
  }
}