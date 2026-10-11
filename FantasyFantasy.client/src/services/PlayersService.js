import { logger } from '../utils/Logger'
import { api, FDPPlayerApi } from './AxiosService'

class PlayersService {
  async getFDPPlayerData(query = '') {
    try {
      const res = await FDPPlayerApi.get(query)
      return res.data
      // AppState.players
    } catch (error) {
      logger.error(error)
    }
  }

  async getMyFDPPlayerData(query = '') {
    try {
      const res = await api.get(query)
      return res.data
      // AppState.players
    } catch (error) {
      logger.error(error)
    }
  }

  async createFDPPlayers(players) {
    try {
      const res = await api.post('api/players/fdpPlayers', players)
      logger.log(res.data)
      return res.data
    } catch (error) {
      logger.error(error)
    }
  }
}

export const playersService = new PlayersService()