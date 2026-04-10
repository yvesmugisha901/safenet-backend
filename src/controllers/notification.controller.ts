import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import pool from '../config/db'

export const listNotifications = async (req: AuthRequest, res: Response) => {
  console.log(`listNotifications — userId: ${req.user!.id}, role: ${req.user!.role}`)
  try {
    const r = await pool.query(
      `SELECT n.id, n.message, n.channel, n.read, n.sent_at,
              n.emergency_id, e.title AS emergency_title, e.type AS emergency_type
       FROM notifications n
       LEFT JOIN emergencies e ON e.id = n.emergency_id
       WHERE n.user_id = $1
       ORDER BY n.sent_at DESC
       LIMIT 50`,
      [req.user!.id]
    )
    console.log(`  → found ${r.rows.length} notifications`)
    res.json(r.rows)
  } catch (err: any) {
    console.error('listNotifications ERROR:', err.message)
    res.status(500).json({ error: `Failed to fetch notifications: ${err.message}` })
  }
}

export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  try {
    const r = await pool.query(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id=$1 AND read=FALSE',
      [req.user!.id]
    )
    res.json({ count: parseInt(r.rows[0].count) })
  } catch (err: any) {
    console.error('getUnreadCount ERROR:', err.message)
    res.status(500).json({ error: 'Failed to get unread count' })
  }
}

export const markRead = async (req: AuthRequest, res: Response) => {
  try {
    await pool.query(
      'UPDATE notifications SET read=TRUE WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user!.id]
    )
    res.json({ success: true })
  } catch (err: any) {
    console.error('markRead ERROR:', err.message)
    res.status(500).json({ error: 'Failed to mark as read' })
  }
}

export const markAllRead = async (req: AuthRequest, res: Response) => {
  try {
    const r = await pool.query(
      'UPDATE notifications SET read=TRUE WHERE user_id=$1 AND read=FALSE',
      [req.user!.id]
    )
    console.log(`markAllRead — updated ${r.rowCount} notifications for ${req.user!.id}`)
    res.json({ success: true })
  } catch (err: any) {
    console.error('markAllRead ERROR:', err.message)
    res.status(500).json({ error: 'Failed to mark all as read' })
  }
}