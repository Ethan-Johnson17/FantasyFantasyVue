import { dbContext } from "../db/DbContext"
import { BadRequest, Forbidden } from "../utils/Errors"

class PartyService {
  async getMyParties(query = {}) {
    const parties = await dbContext.Party.find(query).populate('league')
    return parties
  }
  async getAllParties(query) {
    const parties = await dbContext.Party.find(query).populate('league')
    return parties
  }
  async getPartyById(id) {
    const party = await dbContext.Party.findById(id).populate('league')
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
    // const party = await this.getPartyById(id)
    //  if (party.accountId?.toString() !== body.accountId) {
    //    throw new Forbidden('Cannot edit a party that does not belong to you.')
    //  }
     const myParty = await dbContext.Party.findByIdAndUpdate(id, body, { new: true })
     return myParty
  }
}

export const partyService = new PartyService()