import BaseController from "../utils/BaseController";


export class TeamController extends BaseController {
  constructor() {
    super('api/team')
    this.router
    // .get('', this.getAll)
  }
}