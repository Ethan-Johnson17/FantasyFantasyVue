import { dbContext } from "../db/DbContext"
import { BadRequest, Forbidden } from "../utils/Errors"

class PartyService {
  async getMyParties(query = {}) {
    const parties = await dbContext.Party.find(query).populate('league account')
    return parties
  }
  async getAllParties(query) {
    const parties = await dbContext.Party.find(query).populate('league account')
    return parties
  }
  async getPartyById(id) {
    const party = await dbContext.Party.findById(id).populate('league account')
    if (!party) {
      throw new BadRequest("Requested party cannot be found")
    }
    return party
  }
  async createParty(body) {
    const party = await dbContext.Party.create(body)
    return party
  }

  async editParty(id, body) {
    const party = await this.getPartyById(id)
    if (!party) {
      throw new BadRequest('Party not found')
    }
    if (party.accountId.toString() !== body.accountId) {
      throw new Forbidden('Cannot edit a party that does not belong to you.')
    }
     const myParty = await dbContext.Party.findByIdAndUpdate(id, body, { new: true })
     return myParty
  }
}

export const partyService = new PartyService()