import { dbContext } from '../db/DbContext'
import { BadRequest, Forbidden } from '../utils/Errors'

class LeagueService {
  async createLeague(body) {
      let pin = this.generatePin()
      // let foundLeague = await this.getLeagueByPin(pin)
      // if (foundLeague && foundLeague?.pin == pin.toString()) {
      //   pin = this.generatePin()
      // }
      body.pin = pin
    const league = await dbContext.League.create(body)
    return league.populate('account')
  }

  async getLeagueByPin(pin) {
    const league = await dbContext.League.findOne({pin}).populate('account')
    return league
  }
  
  async getAll(query = {}) {
    const league = await dbContext.League.find(query).populate('account')
    return league
  }
  generatePin() {
    const digit = 100000 + (Math.floor(Math.random() * 100000))
    return digit
  }

  async getMyLeagues(query = {}) {
    const myLeagues = await dbContext.League.find(query).populate('account')
    return myLeagues
  }

  async getById(id) {
    const league = await dbContext.League.findById(id).populate('account')
    return league
  }

  async joinLeague(body) {
    const update = await dbContext.League.findOneAndUpdate({ _id: body.id }, body, { new: true })
    return update
  }

  async editLeague(body) {
    const update = await dbContext.League.findOneAndUpdate({ _id: body.id }, body, { new: true })
    return update
  }

  async deactivateLeague(id, update) {
    const league = await this.getById(id)
    // if (league?.hostId.toString() !== update.accountId) {
    //   throw new Forbidden('na')
    // }
    const newLeague = await dbContext.League.findByIdAndUpdate(id, update, { new: true })
    return newLeague
  }

  async deleteLeague(leagueId, userId) {
    const league = await this.getById(leagueId)
    // if (league?.hostId.toString() !== userId) {
    //   throw new Forbidden('What is your favorite color... wrong')
    // }
    await dbContext.League.findByIdAndDelete(leagueId)
    // await dbContext.Player.deleteMany({ leagueId: leagueId })
    // await dbContext.GameQueue.deleteMany({ leagueId: leagueId })
  }
}

export const leagueService = new LeagueService()