import Axios from 'axios'
import { baseURL } from '../env'
export const api = Axios.create({
  baseURL,
  timeout: 8000
})

export const FDPPlayerApi = Axios.create({
  baseURL: 'https://www.fantasyfootballdatapros.com/api/players',
  timeout: 8000
})
