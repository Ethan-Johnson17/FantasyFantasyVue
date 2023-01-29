import { AppState } from '../AppState'
import { logger } from '../utils/Logger'
import { api, playerApi } from './AxiosService'
const clientKey = '?key=REMOVED_API_KEY'

class PlayersService {
  async getData(query = '') {
    try {
      const res = await playerApi.get('Players' + query + clientKey)
      logger.log(res.data)
      AppState.players
    } catch (error) {
      logger.error(error)
    }
  }
}

export const playersService = new PlayersService()