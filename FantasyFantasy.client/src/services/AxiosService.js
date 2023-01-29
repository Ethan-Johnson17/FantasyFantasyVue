import Axios from 'axios'
import { baseURL } from '../env'
export const api = Axios.create({
  baseURL,
  timeout: 8000
})

export const playerApi = Axios.create({
  baseURL: 'https://api.sportsdata.io/v3/nfl/scores/json',
  timeout: 8000
})
