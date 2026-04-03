import { Router } from 'express'
import {
    listResources,
    getNearbyResources,
    getResource,
    createResource,
    updateResource,
    deleteResource,
} from '../controllers/resource.controller'
import { authenticate, authorize } from '../middleware/auth'
import { validateResource } from '../middleware/validate'

const router = Router()

// Static routes FIRST
router.get('/', authenticate, listResources)
router.get('/nearby', authenticate, getNearbyResources)
router.post('/', authenticate, authorize('admin'), validateResource, createResource)

// Dynamic routes LAST
router.get('/:id', authenticate, getResource)
router.patch('/:id', authenticate, authorize('resource_manager', 'admin'), updateResource)
router.delete('/:id', authenticate, authorize('admin'), deleteResource)

export default router