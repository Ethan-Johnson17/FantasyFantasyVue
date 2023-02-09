import mongoose from 'mongoose'
import { AccountSchema } from '../models/Account'
import { HeroSchema } from '../models/Hero';
import { LeagueSchema } from '../models/League';
import { PartySchema } from '../models/Party';
import { TeamSchema } from '../models/Team';

class DbContext {
  Account = mongoose.model('Account', AccountSchema);
  Team = mongoose.model('Team', TeamSchema);
  // Party = mongoose.model('Party', PartySchema);
  // League = mongoose.model('League', LeagueSchema);
  // Hero = mongoose.model('Hero', HeroSchema);
}

export const dbContext = new DbContext()
