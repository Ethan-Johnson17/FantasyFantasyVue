import { Router } from 'express'
import { currentAccount } from '../../middleware/auth.js'
import { AccountUpdateSchema, updateAccount } from './account.service.js'
import { deleteAccount } from './deletion.service.js'

export const accountRouter = Router()
  .get('/', (req, res) => {
    res.json(currentAccount(req))
  })
  .patch('/', async (req, res) => {
    const update = AccountUpdateSchema.parse(req.body)
    res.json(await updateAccount(currentAccount(req), update))
  })
  .delete('/', async (req, res) => {
    await deleteAccount(currentAccount(req))
    res.status(204).end()
  })
