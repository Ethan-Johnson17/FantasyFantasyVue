import { dbContext } from "../db/DbContext"

class PartyService {
  async getMyParties(query = {}) {
    const parties = await dbContext.Party.find(query)
    return parties
  }
  getAllParties(query) {
    throw new Error("Method not implemented.")
  }
  getPartyById(id) {
    throw new Error("Method not implemented.")
  }
  createParty(body) {
    throw new Error("Method not implemented.")
  }
  

  editParty(id, party) {
    throw new Error("Method not implemented.")
  }
}

export const partyService = new PartyService()