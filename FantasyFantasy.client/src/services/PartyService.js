import { AppState } from "../AppState"
import { logger } from "../utils/Logger"
import { api } from "./AxiosService"

class PartyService {
    async getMyParties(query = {}) {
    try {
        const res = await api.get(query)
        AppState.myParties = res.data
      } catch (err) {
        logger.error('Error getting parties', err)
      }
  }

  async createParty(partyData) {
    try {
      const res = await api.post('api/parties', partyData)
      AppState.myParties.push(res.data)
    } catch (error) {
      logger.error('Error creating party', error)
    }
  }

    async editParty(partyId, partyData) {
      try {
      let res = await api.put('api/parties/' + partyId, partyData)
      let newParty = res.data
      let myPartiesIndex = AppState.myParties.findIndex(g => g.id === newParty.id)
    
      if (myPartiesIndex === -1) {
        AppState.myParties.unshift(newParty)
      }
      AppState.myParties.splice(myPartiesIndex, 1, newParty)
    } catch (error) {
      logger.error(error)
    }
  }


}

export const partyService = new PartyService()