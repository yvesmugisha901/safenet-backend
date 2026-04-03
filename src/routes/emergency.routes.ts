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

// Static routes FIRST
router.post('/', authenticate, validateEmergency, reportEmergency)
router.get('/', authenticate, listEmergencies)
router.get('/stats', authenticate, authorize('admin'), getStats)

// Dynamic routes LAST
router.get('/:id', authenticate, getEmergency)
router.patch('/:id/status', authenticate, authorize('resource_manager', 'admin'), updateEmergencyStatus)

export default router