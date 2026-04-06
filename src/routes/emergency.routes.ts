import { Router } from 'express'
import {
    reportEmergency,
    listEmergencies,
    getEmergency,
    updateEmergencyStatus,
    getStats,
} from '../controllers/emergency.controller'
import { authenticate, authorize } from '../middleware/auth'
import { validateEmergency } from '../middleware/validate'

const router = Router()

router.post('/', authenticate, validateEmergency, reportEmergency)
router.get('/', authenticate, listEmergencies)
router.get('/stats', authenticate, authorize('admin'), getStats)
router.get('/:id', authenticate, getEmergency)

// Allow user to also update their own emergency status (cancel)
// resource_manager and admin can update any
router.patch('/:id/status', authenticate, updateEmergencyStatus)

export default router