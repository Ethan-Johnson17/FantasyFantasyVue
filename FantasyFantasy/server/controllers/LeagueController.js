import { Auth0Provider } from "@bcwdev/auth0provider";
import BaseController from "../utils/BaseController";

export class LeagueController extends BaseController {
  constructor() {
    super('api/leagues')
    this.router
      .use(Auth0Provider.getAuthorizedUserInfo)

  }
}