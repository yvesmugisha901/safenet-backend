import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import pool from '../config/db'

export const listNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT n.*, e.title AS emergency_title, e.type AS emergency_type
       FROM notifications n
       LEFT JOIN emergencies e ON e.id = n.emergency_id
       WHERE n.user_id = $1
       ORDER BY n.sent_at DESC LIMIT 50`,
      [req.user!.id]
    )
    console.log(`Notifications for ${req.user!.id} (${req.user!.role}): ${r.rows.length} found`)
    res.json(r.rows)
  } catch (err) {
    console.error('listNotifications error:', err)
    res.status(500).json({ error: 'Failed to fetch notifications' })
  }
}

export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id=$1 AND read=FALSE`,
      [req.user!.id]
    )
    res.json({ count: parseInt(r.rows[0].count) })
  } catch (err) {
    res.status(500).json({ error: 'Failed to get unread count' })
  }
}

export const markRead = async (req: AuthRequest, res: Response) => {
  try {
    await pool.query(
      `UPDATE notifications SET read=TRUE WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user!.id]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark as read' })
  }
}

export const markAllRead = async (req: AuthRequest, res: Response) => {
  try {
    await pool.query(
      `UPDATE notifications SET read=TRUE WHERE user_id=$1 AND read=FALSE`,
      [req.user!.id]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all as read' })
  }
}