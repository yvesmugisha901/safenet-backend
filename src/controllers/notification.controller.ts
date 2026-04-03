import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { NotificationModel } from '../models/Notification'

export const listNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const notifications = await NotificationModel.findByUser(req.user!.id)
    res.json(notifications)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' })
  }
}

export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  try {
    const count = await NotificationModel.unreadCount(req.user!.id)
    res.json({ count })
  } catch (err) {
    res.status(500).json({ error: 'Failed to get unread count' })
  }
}

export const markRead = async (req: AuthRequest, res: Response) => {
  try {
    const success = await NotificationModel.markRead(req.params.id, req.user!.id)
    if (!success) return res.status(404).json({ error: 'Notification not found' })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark as read' })
  }
}

export const markAllRead = async (req: AuthRequest, res: Response) => {
  try {
    await NotificationModel.markAllRead(req.user!.id)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all as read' })
  }
}