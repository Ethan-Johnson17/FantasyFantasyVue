import { AppState } from "../AppState"
import { logger } from "../utils/Logger"
import { api } from "./AxiosService"

class LeagueService {
  async getAll(query = '') {
    const res = await api.get('api/leagues')
    AppState.leagues = res.data
  }

  async startLeague(leagueData) {
    const res = await api.post('api/leagues', leagueData)
    AppState.activeLeague = res.data
    AppState.myLeagues.push(res.data)
  }

   async getMyLeagues(query = '') {
    // this res is getting the nights I created
    const res = await api.get(query)

    // this res2 is getting the nights I've joined
    //  Need to filter out hosted leagues. For now, this will be used as hosted.
    const res2 = await api.get('account/leagues')
     
    // logger.log(res.data)
    // sort by date
    let hosted = (res.data)
    let joined = (res2.data)

    // separate arrays for nights I created and nights I've joined
    // AppState.myLeagues = hosted
    AppState.myLeagues = res2.data
    // AppState.joinedLeagues = joined
  }

  async getById(id) {
    const res = await api.get(`api/leagues/${id}`)
    AppState.activeLeague = res.data
    logger.log(res.data)
  }

  async joinLeague(league, unit) {
    unit.leagueId = league.id
    logger.log(unit, league)
    league.participants.push(unit.accountId)
    if (unit.teamId) {
      league.teams.push(unit)
    } else {
      league.parties.push(unit)
    }
    let res = await api.put(`api/leagues/${league.id}`, league)
    AppState.activeLeague = res
    const index = AppState.leagues.findIndex(l => l.id === res.id)
    if (index === -1) {
      AppState.leagues.unshift(res)
    }
    AppState.leagues.splice(index, 1, res)
  }

  async editLeague(league) {
    let res = await api.put(`api/leagues/${league.id}`, league)
    AppState.activeLeague = res
    const index = AppState.leagues.findIndex(l => l.id === res.id)
    if (index === -1) {
      AppState.leagues.unshift(res)
    }
    AppState.leagues.splice(index, 1, res)
  }

}


export const leagueService = new LeagueService()