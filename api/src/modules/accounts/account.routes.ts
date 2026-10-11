import { Router } from 'express'
import { currentAccount } from '../../middleware/auth.js'
import { AccountUpdateSchema, updateAccount } from './account.service.js'

export const accountRouter = Router()
  .get('/', (req, res) => {
    res.json(currentAccount(req))
  })
  .patch('/', async (req, res) => {
    const update = AccountUpdateSchema.parse(req.body)
    res.json(await updateAccount(currentAccount(req), update))
  })
