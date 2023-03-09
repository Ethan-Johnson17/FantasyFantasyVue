import { AppState } from '../AppState'
import { logger } from '../utils/Logger'
import { api, FDPPlayerApi, playerApi } from './AxiosService'
const clientKey = '?key=REMOVED_API_KEY'

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

  async getData(query = '') {
    try {
      const res = await playerApi.get('Players' + query + clientKey)
      logger.log(res.data)
      AppState.FDPPlayers = res.data
    } catch (error) {
      logger.error(error)
    }
  }

  async createFDPPlayers(players) {
    try {
      const res = await api.post('api/players/fdpPlayers', players)
      logger.log(res.data)
      return res.data
    } catch {
      logger.error(error)
    }
  }
}

export const playersService = new PlayersService()