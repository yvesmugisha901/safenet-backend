import { Router } from 'express'
import {
    listNotifications,
    markRead,
    markAllRead,
    getUnreadCount,
} from '../controllers/notification.controller'
import { authenticate } from '../middleware/auth'

const router = Router()

// Static routes FIRST
router.get('/', authenticate, listNotifications)
router.get('/unread', authenticate, getUnreadCount)
router.patch('/read-all', authenticate, markAllRead)

// Dynamic routes LAST
router.patch('/:id/read', authenticate, markRead)

export default router