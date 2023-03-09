import { dbContext } from "../db/DbContext"

class PlayerService {
  async getFDPPlayers(season) {
    const players = await dbContext.FDPPlayer.find({ season })
    return players
  }
  async createFDPPlayer(body) {
    const player = await dbContext.FDPPlayer.create(body)
    return player
  }

}

export const playerService = new PlayerService()