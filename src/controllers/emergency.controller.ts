import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import pool from '../config/db'
import { haversineDistance } from '../utils/geo'
import { sendSMS } from '../services/twilio.service'
import { sendEmail } from '../services/sendgrid.service'
import { io } from '../server'

const MAX_RADIUS_KM = 20

// Helper: create notification in DB
async function createNotif(userId: string, emergencyId: string, message: string, channel = 'in_app') {
  try {
    const r = await pool.query(
      `INSERT INTO notifications (user_id, emergency_id, message, channel) VALUES ($1,$2,$3,$4) RETURNING *`,
      [userId, emergencyId, message, channel]
    )
    return r.rows[0]
  } catch (err) {
    console.error('createNotif error:', err)
    return null
  }
}

// Helper: notify all admins
async function notifyAdmins(emergencyId: string, message: string) {
  try {
    const admins = await pool.query(`SELECT id FROM users WHERE role='admin'`)
    for (const admin of admins.rows) {
      const notif = await createNotif(admin.id, emergencyId, message)
      if (notif) io.to(`user_${admin.id}`).emit('notification', notif)
    }
  } catch (err) {
    console.error('notifyAdmins error:', err)
  }
}

export const reportEmergency = async (req: AuthRequest, res: Response) => {
  const { title, description, type, latitude, longitude } = req.body
  try {
    // 1. Save emergency
    const eResult = await pool.query(
      `INSERT INTO emergencies (title, description, type, latitude, longitude, reported_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title, description || null, type, parseFloat(latitude), parseFloat(longitude), req.user?.id || null]
    )
    const emergency = eResult.rows[0]

    // 2. Find available resources and match by distance
    const rResult = await pool.query(
      `SELECT res.*, u.phone AS manager_phone, u.email AS manager_email
       FROM resources res LEFT JOIN users u ON u.id = res.manager_id
       WHERE res.available = TRUE`
    )
    const nearby = rResult.rows
      .map((r: any) => ({ ...r, distance_km: haversineDistance(latitude, longitude, r.latitude, r.longitude) }))
      .filter((r: any) => r.distance_km <= MAX_RADIUS_KM)
      .sort((a: any, b: any) => a.distance_km - b.distance_km)
      .slice(0, 5)

    // 3. Alert nearby resource managers
    for (const resource of nearby) {
      const msg = `SAFENET ALERT: "${title}" (${type}) reported ${resource.distance_km.toFixed(1)}km from ${resource.name}`
      if (resource.manager_phone) await sendSMS(resource.manager_phone, msg)
      if (resource.manager_email) await sendEmail({ to: resource.manager_email, subject: `Emergency Alert — ${title}`, text: msg })
      if (resource.manager_id) {
        const notif = await createNotif(resource.manager_id, emergency.id, `🚨 ${msg}`)
        if (notif) io.to(`user_${resource.manager_id}`).emit('notification', notif)
      }
    }

    // 4. Notify reporter
    if (req.user?.id) {
      const notif = await createNotif(req.user.id, emergency.id, `Your emergency report "${title}" was submitted. Nearby resources have been alerted.`)
      if (notif) io.to(`user_${req.user.id}`).emit('notification', notif)
    }

    // 5. Notify all admins
    await notifyAdmins(emergency.id, `📋 New emergency: "${title}" (${type}) reported by ${req.user?.id ? 'a user' : 'anonymous'}`)

    // 6. Broadcast to all connected clients
    io.emit('new_emergency', { emergency, nearbyResources: nearby })
    res.status(201).json({ emergency, nearbyResources: nearby })
  } catch (err) {
    console.error('reportEmergency error:', err)
    res.status(500).json({ error: 'Failed to report emergency' })
  }
}

export const listEmergencies = async (_req: AuthRequest, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT e.*, u.name AS reported_by_name
       FROM emergencies e LEFT JOIN users u ON u.id = e.reported_by
       ORDER BY e.created_at DESC`
    )
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch emergencies' })
  }
}

export const getEmergency = async (req: AuthRequest, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT e.*, u.name AS reported_by_name FROM emergencies e LEFT JOIN users u ON u.id = e.reported_by WHERE e.id=$1`,
      [req.params.id]
    )
    if (!r.rows[0]) return res.status(404).json({ error: 'Emergency not found' })
    res.json(r.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch emergency' })
  }
}

export const updateEmergencyStatus = async (req: AuthRequest, res: Response) => {
  const { id } = req.params
  const { status } = req.body
  const role = req.user?.role
  console.log(`Status update — user: ${req.user?.id}, role: ${role}, status: ${status}`)

  const validStatuses = ['pending', 'responding', 'resolved', 'cancelled']
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' })

  if (role === 'user') {
    if (status !== 'cancelled') return res.status(403).json({ error: 'Users can only cancel emergencies' })
    const check = await pool.query('SELECT reported_by FROM emergencies WHERE id=$1', [id])
    if (!check.rows[0]) return res.status(404).json({ error: 'Emergency not found' })
    if (check.rows[0].reported_by !== req.user?.id) return res.status(403).json({ error: 'You can only cancel your own emergencies' })
  }

  try {
    const r = await pool.query(
      `UPDATE emergencies SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [status, id]
    )
    if (!r.rows[0]) return res.status(404).json({ error: 'Emergency not found' })
    const updated = r.rows[0]

    // Get reporter name for audit
    let reporterName = 'Anonymous'
    if (updated.reported_by) {
      const uRes = await pool.query('SELECT name FROM users WHERE id=$1', [updated.reported_by])
      if (uRes.rows[0]) reporterName = uRes.rows[0].name
    }

    // Get action taker name
    let actorName = 'System'
    if (req.user?.id) {
      const aRes = await pool.query('SELECT name FROM users WHERE id=$1', [req.user.id])
      if (aRes.rows[0]) actorName = aRes.rows[0].name
    }

    // Notify reporter about status change
    const userMessages: Record<string, string> = {
      responding: `✅ Help is on the way! A resource manager is now responding to your emergency: "${updated.title}"`,
      resolved: `🎉 Your emergency "${updated.title}" has been resolved. Stay safe!`,
      cancelled: `Your emergency report "${updated.title}" was rejected by a resource manager.`,
    }
    if (updated.reported_by && userMessages[status]) {
      const notif = await createNotif(updated.reported_by, updated.id, userMessages[status])
      if (notif) io.to(`user_${updated.reported_by}`).emit('notification', notif)
    }

    // Notify admins with audit info
    const adminMessages: Record<string, string> = {
      responding: `⚡ ${actorName} (manager) accepted emergency "${updated.title}" reported by ${reporterName}`,
      resolved: `✅ ${actorName} resolved emergency "${updated.title}" reported by ${reporterName}`,
      cancelled: `✕ ${actorName} rejected emergency "${updated.title}" reported by ${reporterName}`,
    }
    if (adminMessages[status]) {
      await notifyAdmins(updated.id, adminMessages[status])
    }

    io.emit('emergency_updated', updated)
    res.json(updated)
  } catch (err) {
    console.error('updateEmergencyStatus error:', err)
    res.status(500).json({ error: 'Failed to update status' })
  }
}

export const getStats = async (_req: AuthRequest, res: Response) => {
  try {
    const summary = await pool.query(`
      SELECT COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status='pending')    AS pending,
        COUNT(*) FILTER (WHERE status='responding') AS responding,
        COUNT(*) FILTER (WHERE status='resolved')   AS resolved,
        COUNT(*) FILTER (WHERE status='cancelled')  AS cancelled
      FROM emergencies`)
    const byType = await pool.query(`SELECT type, COUNT(*) AS count FROM emergencies GROUP BY type ORDER BY count DESC`)
    const byDay = await pool.query(`
      SELECT DATE(created_at) AS day, COUNT(*) AS count
      FROM emergencies WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY day ORDER BY day`)
    res.json({ summary: summary.rows[0], byType: byType.rows, byDay: byDay.rows })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
}