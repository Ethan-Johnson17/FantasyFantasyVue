import { Auth0Provider } from "@bcwdev/auth0provider";
import { heroService } from "../services/HeroService";
import BaseController from "../utils/BaseController";

export class HeroController extends BaseController {
  constructor() {
    super('api/heroes')
    this.router
    .get('', this.getAllHeroes)
    .get('/party/:id', this.getHeroesByParty)
    .use(Auth0Provider.getAuthorizedUserInfo)
    .get('/:id', this.getHeroById)
    .post('', this.createHero)
    .put('/:id', this.editHero)
  }
  async getAllHeroes(req, res, next) {
    try {
      const query = req.query
      const heroes = await heroService.getAllHeroes(query)
      return res.send(heroes)
    } catch (error) {
      next(error)
    }
  }

  async getHeroesByParty(req, res, next) {
    try {
      const query = req.query
      const heroes = await heroService.getHeroesByParty(query)
      return res.send(heroes)
    } catch (error) {
      next(error)
    }
  }
  async getHeroById(req, res, next) {
    try {
      let hero = await heroService.getHeroById(req.params.id)
      return res.send(hero)
    } catch (error) {
      next(error)
    }
  }
  async createHero(req, res, next) {
    try {
      req.body.accountId = req.userInfo.id
      const hero = await heroService.createHero(req.body)
      return res.send(hero)
    } catch (error) {
      next(error)
    }
  }
  async editHero(req, res, next) {
    try {
      const id = req.params.id
      const hero = req.body
      hero._id = id
      const updatedHero = await heroService.editHero(id, hero)
      return res.send(updatedHero)
    } catch (error) {
      next(error)
    }
  }
}