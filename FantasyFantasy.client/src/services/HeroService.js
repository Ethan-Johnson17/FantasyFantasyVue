import { AppState } from "../AppState"
import { logger } from "../utils/Logger";
import { api } from "./AxiosService";
import { playersService } from "./PlayersService";

class HeroService {
  async createHero() {
  
  }

  async generateHeroes() {
    try {
      const res = await api.post('api/heroes')
      AppState.heroes.push(res.data)      
    } catch (error) {
      logger.error(error)
    }
  }

  async getAllHeroes(query = '') {
    try {
    let res = await api.get('api/heroes/' + query)
    AppState.heroes = res.data
    return res.data
    } catch (error) {
      logger.error(error)
    }
  }
  
  async getHeroesByParty(id) {
    try {
    let res = await api.get('api/heroes/party/' + id);
    AppState.teamsHeroes = res.data;
    return res.data;
    } catch (error) {
      logger.error(error)
    }
  }
}



export const heroService = new HeroService()