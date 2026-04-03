import { Router } from 'express'
import { register, login, getMe, getAllUsers, updateUserRole } from '../controllers/auth.controller'
import { authenticate, authorize } from '../middleware/auth'
import { validateRegister } from '../middleware/validate'

const router = Router()

router.post('/register', validateRegister, register)
router.post('/login', login)
router.get('/me', authenticate, getMe)
router.get('/users', authenticate, authorize('admin'), getAllUsers)
router.patch('/users/:id/role', authenticate, authorize('admin'), updateUserRole)

export default router