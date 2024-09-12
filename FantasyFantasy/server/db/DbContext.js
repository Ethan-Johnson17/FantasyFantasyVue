import mongoose from 'mongoose'
import { AccountSchema, ProfileSchema } from '../models/Account'
import { HeroSchema } from '../models/Hero';
import { LeagueSchema } from '../models/League';
import { PartySchema } from '../models/Party';
import { TeamSchema } from '../models/Team';
import { PlayerSchema } from '../models/Player';
import { FDPPlayerSchema } from '../models/FDPPlayer';

class DbContext {
  Account = mongoose.model('Account', AccountSchema);
  Profile = mongoose.model('Profile', ProfileSchema, 'accounts');
  Team = mongoose.model('Team', TeamSchema);
  Party = mongoose.model('Party', PartySchema);
  League = mongoose.model('League', LeagueSchema);
  Hero = mongoose.model('Hero', HeroSchema);
  Player = mongoose.model('Player', PlayerSchema)
  FDPPlayer = mongoose.model('FDPPlayer', FDPPlayerSchema)
}

export const dbContext = new DbContext()
