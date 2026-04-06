import { Router } from 'express'
import {
    listResources, getMyResources, getNearbyResources,
    getResource, createResource, updateResource, deleteResource
} from '../controllers/resource.controller'
import { authenticate, authorize } from '../middleware/auth'
import { validateResource } from '../middleware/validate'

const router = Router()

router.get('/', authenticate, listResources)
router.get('/mine', authenticate, authorize('resource_manager'), getMyResources)
router.get('/nearby', authenticate, getNearbyResources)
router.post('/', authenticate, authorize('resource_manager', 'admin'), validateResource, createResource)
router.get('/:id', authenticate, getResource)
router.patch('/:id', authenticate, authorize('resource_manager', 'admin'), updateResource)
router.delete('/:id', authenticate, authorize('admin'), deleteResource)

export default router