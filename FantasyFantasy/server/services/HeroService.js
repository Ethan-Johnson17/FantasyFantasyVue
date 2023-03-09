import { dbContext } from "../db/DbContext"
import { BadRequest } from "../utils/Errors"

class HeroService {
  async getMyHeroes(query = {}) {
    const heroes = await dbContext.Hero.find(query).populate('party').populate('quest').populate('player').populate('account').populate('FDPPlayer')
    return heroes
  }

  async getHeroesByParty(query) {
    const heroes = await dbContext.Hero.find({query}).populate('party').populate('quest').populate('player').populate('account').populate('FDPPlayer')
    return heroes
  }
  async getAllHeroes(query) {
    const heroes = await dbContext.Hero.find({query}).populate('party').populate('quest').populate('player').populate('account').populate('FDPPlayer')
    return heroes
  }
  async getHeroById(id) {
    const hero = await dbContext.Hero.findById(id).populate('party').populate('quest').populate('player').populate('account')
    if (!hero) {
      throw new BadRequest("Requested {Hero} cannot be found")
    }
    return hero
  }
  async createHero(body) {
    const hero = await dbContext.Hero.create(body)
    return hero
  }

  async editHero(id, hero) {
    throw new Error("Method not implemented.")
  }
}

export const heroService = new HeroService()