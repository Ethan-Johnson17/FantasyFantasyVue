import { dbContext } from "../db/DbContext"
import { BadRequest, Forbidden } from '../utils/Errors'


class TeamService {
   async getAllTeams(query = {}) {
    const team = await dbContext.Team.find(query).populate('account').populate('party').populate('league')
    return team
  }

  async getMyTeams(query = {}) {
    const teams = await dbContext.Team.find(query).populate('party').populate('league')
    return teams
  }

  async getTeamById(id) {
    const team = await dbContext.Team.findById(id).populate('account')
    if (!team) {
      throw new BadRequest("Requested team cannot be found")
    }
    return team
  }

  async createTeam(body) {
    const team = await dbContext.Team.create(body)
    return team
  }

   async editTeam(id, body) {
     const team = await this.getTeamById(id)
    //  if (team.accountId?.toString() !== body.accountId) {
    //    throw new Forbidden('Cannot edit a team that does not belong to you.')
    //  }
     const myTeam = await dbContext.Team.findByIdAndUpdate(id, body, { new: true })
     return myTeam
  }
}

export const teamService = new TeamService()