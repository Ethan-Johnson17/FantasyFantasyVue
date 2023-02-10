import { dbContext } from '../db/DbContext'

class LeagueService {
  async createLeague(body) {
    body.pin = this.generatePin()
    const league = await dbContext.League.create(body)
    return league.populate('account')
  }
  
  async getAll(query = {}) {
    const league = await dbContext.League.find(query).populate('account')
    return league
  }
  generatePin() {
    const digit = 100000 + (Math.floor(Math.random() * 100000))
    return digit
  }
}

export const leagueService = new LeagueService()