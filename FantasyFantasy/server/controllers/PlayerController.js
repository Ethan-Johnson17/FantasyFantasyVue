import { Auth0Provider } from "@bcwdev/auth0provider";
import { playerService } from "../services/PlayerService";
import BaseController from "../utils/BaseController";

export class PlayerController extends BaseController {
   constructor() {
    super('api/players')
    this.router
    .get('', this.getAllPlayers)
    .get('/fdpPlayers/:season', this.getFDPPlayers)
    .use(Auth0Provider.getAuthorizedUserInfo)
    .get('/:id', this.getPlayerById)
    .post('', this.createPlayer)
    .post('/fdpPlayers', this.createFDPPlayer)
    .put('/:id', this.editPlayer)
  }
  getAllPlayers(arg0, getAllPlayers) {
    throw new Error("Method not implemented.");
  }
  async getFDPPlayers(req, res, next) {
    try {
      const players = await playerService.getFDPPlayers(req.params.season)
      return res.send(players)
    } catch (error) {
      next(error)
    }
  }
  getPlayerById(arg0, getPlayerById) {
    throw new Error("Method not implemented.");
  }
  async createFDPPlayer(req, res, next) {
    try {
      req.body.accountId = req.userInfo.id
      const player = await playerService.createFDPPlayer(req.body)
      return res.send(player)
    } catch (error) {
      next(error)
    }
  }
  createPlayer(arg0, createPlayer) {
    throw new Error("Method not implemented.");
  }
  editPlayer(arg0, editPlayer) {
    throw new Error("Method not implemented.");
  }
 }