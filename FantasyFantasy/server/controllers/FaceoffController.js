import { faceoffService } from '../services/FaceoffService'
import { leagueService } from '../services/LeagueService'
import BaseController from '../utils/BaseController'
import { Auth0Provider } from '@bcwdev/auth0provider'

  // NOTE We need to be able to pull up a schedule for the league. We can save an array of faceoffs to the league and to the unit. If we go that route, we don't need to use these get methods. 
export class FaceoffController extends BaseController {
  constructor() {
    super('api/faceoff')
    this.router
      .use(Auth0Provider.getAuthorizedUserInfo)
      .post('', this.create)
      .get('/league/:leagueid', this.getFaceoffsByLeague)
      // FIXME Does this specifically have to say id?
      .get('/:unitId', this.getFaceoffsByUnit)
      .get('/:id', this.getByFaceoffId)
      .put('/:id', this.edit)
      .delete('/:id', this.remove)
      .put('/:id/isCanceled', this.cancel)
  }

  async create(req, res, next) {
    try {
      req.body.accountId = req.userInfo.id
      const faceoff = await faceoffService.create(req.body)
      return res.send(faceoff)
    } catch (error) {
      next(error)
    }
  }

  async getByFaceoffId(req, res, next) {
    try {
      req.body.id = req.params.id
      const faceoff = await faceoffService.getByFaceoffId(req.params.id)
      return res.send(faceoff)
    } catch (error) {
      next(error)
    }
  }

  async getFaceoffsByLeague(req, res, next) {
    try {
      // NOTE is this a list of faceoffs?
      const schedule = await leagueService.getSchedule({ leagueId: req.params.id })
      return res.send(schedule)
    } catch (error) {
      next(error)
    }
  }

  async getFaceoffsByUnit(req, res, next) {
    try {
      const schedule = await faceoffService.getSchedule(req.params.pin)
      return res.send(schedule)
    } catch (error) {
      next(error)
    }
  }

  async edit(req, res, next) {
    try {
      req.body.accountId = req.userInfo.id
      req.body.id = req.params.id
      const faceoff = await faceoffService.edit(req.body)
      return res.send(faceoff)
    } catch (error) {
      next(error)
    }
  }

  async cancel(req, res, next) {
    try {
      const accountId = req.userInfo.id
      const id = req.params.id
      const cancelGamenight = await faceoffService.cancel(id, { isCanceled: true, accountId: accountId })
      return res.send(cancelGamenight)
    } catch (error) {
      next(error)
    }
  }

  async remove(req, res, next) {
    try {
      const userId = req.userInfo.id
      const gamenightId = req.params.id
      await faceoffService.remove(gamenightId, userId)
      res.send('Sad day, you cancelled on me')
    } catch (error) {
      next(error)
    }
  }
}