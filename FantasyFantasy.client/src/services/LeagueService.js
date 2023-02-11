import { AppState } from "../AppState"
import { logger } from "../utils/Logger"

class LeagueService {
  async startLeague(leagueData) {
    const res = await api.post('api/leagues', leagueData)
    AppState.activeLeague = res.data
    AppState.myLeagues.push(res.data)
  }

   async getMyLeagues(query = '') {
    // this res is getting the nights I created
    const res = await api.get(query)

    // this res2 is getting the nights I've joined
    const res2 = await api.get('account/leagues')

    // sort by date
    let hosted = this.sortByDate(res.data)
    let joined = this.sortByDate(res2.data)

    // separate arrays for nights I created and nights I've joined
    AppState.myLeagues = hosted
    AppState.joinedLeagues = joined

    logger.log('Game nights I created:', AppState.myGameNights)
    logger.log('Game nights I joined:', AppState.myAttendance)
  }
}

export const leagueService = new LeagueService()