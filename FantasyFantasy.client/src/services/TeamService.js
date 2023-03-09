import { AppState } from '../AppState'
import { logger } from '../utils/Logger'
import { api } from './AxiosService'

class TeamService {
  async getMyTeams(query = {}) {
    try {
        const res = await api.get(query)
        AppState.myTeams = res.data
      } catch (err) {
        logger.error('Error getting team', err)
      }
  }

  async createTeam(teamData) {
    try {
      const res = await api.post('api/teams', teamData)
      AppState.myTeam = res.data
      AppState.teams.push(res.data)
    } catch (error) {
      logger.log('Error creating team', error)
    }
  }

  async editTeam(teamId, teamData) {
    try {
      let res = await api.put('api/teams/' + teamId, teamData)
      let newTeam = res.data
      let myTeamsIndex = AppState.myTeams.findIndex(g => g.id === newTeam.id)
      let allTeamsIndex = AppState.allTeams.findIndex(g => g.id === newTeam.id)
      logger.log(myTeamsIndex)
      if (myTeamsIndex === -1) {
        AppState.myTeams.unshift(newTeam)
      }
      if (allTeamsIndex === -1) {
        AppState.allTeams.unshift(newTeam)
      }
      AppState.myTeams.splice(myTeamsIndex, 1, newTeam)
      AppState.allTeams.splice(allTeamsIndex, 1, newTeam)
    } catch (error) {
      logger.error(error)
    }
  }

  // async getTopTeams
}

export const teamService = new TeamService()