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
    const res2 = await api.get('account/leagues')
     
    // sort by date
    let hosted = (res2.data.hosting)
    let joined = res2.data.attending.filter(l => l.hostId !== AppState.account.id)
    // separate arrays for leagues I created and leagues I've joined
    // AppState.myLeagues = hosted
    AppState.myLeagues = hosted
    AppState.joinedLeagues = joined
  }

  async getById(id) {
    const res = await api.get(`api/leagues/${id}`)
    // const resParticipants = await api.get(`api/leagues/${id}/participants/`, { params: { ids: res.data.participants.join(',') } })
    res.data.participants = res.data.participants
    AppState.activeLeague = res.data
  }

  async joinLeague(league, unit) {
    unit.leagueId = league.id
    league.participants.push(unit.account)
    if (unit.teamId) {
      league.teams.push(unit)
    } else {
      league.parties.push(unit)
    }
    let res = await api.put(`api/leagues/${league.id}`, league)
    AppState.activeLeague = res.data
    const index = AppState.leagues.findIndex(l => l.id === res.data.id)
    if (index === -1) {
      AppState.leagues.unshift(res.data)
    }
    AppState.leagues.splice(index, 1, res.data)
  }

  async editLeague(league) {
    // TODO add a layer of security to prevent non hosts from editing the league UNLESS they're marking themselves as ready. 
    let res = await api.put(`api/leagues/${league.id}`, league)
    AppState.activeLeague = res.data
    const index = AppState.leagues.findIndex(l => l.id === res.data.id)
    if (index === -1) {
      AppState.leagues.unshift(res.data)
    }
    AppState.leagues.splice(index, 1, res.data)
  }
  
  async deactivateLeague(leagueId) {
    let res = await api.put(`api/leagues/${leagueId}`)
    AppState.activeLeague = res.data
    const index = AppState.leagues.findIndex(l => l.id === res.data.id)
    if (index === -1) {
      AppState.leagues.unshift(res.data)
    }
    AppState.leagues.splice(index, 1, res.data)
  }

  async getLeagueParticipantProfiles(leagueId, participants) {
    let res = await api.get(`api/leagues/${leagueId}`, { params: { ids: participantIds.join(',') } })
  }

}


export const leagueService = new LeagueService()