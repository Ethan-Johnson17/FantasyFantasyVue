import { partyService } from "../services/PartyService";
import BaseController from "../utils/BaseController";


export class PartyController extends BaseController {
  constructor() {
    super('api/parties')
    this.router
      .get('', this.getAllParties)
      .get('/:id', this.getPartyById)
      .post('', this.createParty)
      .put('/:id', this.editParty)
  }

  async getAllParties(req, res, next) {
    try {
      const query = req.query
      const party = await partyService.getAllParties(query)
      return res.send(party)
    } catch (error) {
      next(error)
    }
  }

  async getPartyById(req, res, next) {
    try {
      let party = await partyService.getPartyById(req.params.id);
      return res.send(party)
    } catch (error) {
      next(error)
    }
  }
  async createParty(req, res, next) {
    try {
      req.body.accountId = req.userInfo.id
      const party = await partyService.createParty(req.body)
      return res.send(party)
    } catch (error) {
      next(error)
    }
  }

  async editParty(req, res, next) {
    try {
      const id = req.params.id
      const party = req.body
      party._id = id
      const updatedParty = await partyService.editParty(id, party)
      return res.send(updatedParty)
    } catch (error) {
      next(error)
    }
  }
}