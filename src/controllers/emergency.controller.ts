import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import pool from '../config/db'
import { haversineDistance } from '../utils/geo'
import { sendSMS } from '../services/twilio.service'
import { sendEmail } from '../services/sendgrid.service'
import { io } from '../server'

const MAX_RADIUS_KM = 20

async function createNotif(userId: string, emergencyId: string, message: string, channel = 'in_app') {
  try {
    const r = await pool.query(
      `INSERT INTO notifications (user_id,emergency_id,message,channel) VALUES ($1,$2,$3,$4) RETURNING *`,
      [userId, emergencyId, message, channel]
    )
    return r.rows[0]
  } catch (err: any) {
    console.error('createNotif error:', err.message)
    return null
  }
}

async function notifyAllAdmins(emergencyId: string, message: string) {
  try {
    const admins = await pool.query(`SELECT id FROM users WHERE role='admin'`)
    console.log(`Notifying ${admins.rows.length} admin(s): ${message}`)
    for (const admin of admins.rows) {
      const notif = await createNotif(admin.id, emergencyId, message)
      if (notif) io.to(`user_${admin.id}`).emit('notification', notif)
    }
  } catch (err: any) {
    console.error('notifyAllAdmins error:', err.message)
  }
}

export const reportEmergency = async (req: AuthRequest, res: Response) => {
  const { title, description, type, latitude, longitude } = req.body
  try {
    const eRes = await pool.query(
      `INSERT INTO emergencies (title,description,type,latitude,longitude,reported_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title, description || null, type, parseFloat(latitude), parseFloat(longitude), req.user?.id || null]
    )
    const emergency = eRes.rows[0]

    // Find nearby available resources
    const rRes = await pool.query(
      `SELECT res.*, u.phone AS manager_phone, u.email AS manager_email
       FROM resources res LEFT JOIN users u ON u.id = res.manager_id
       WHERE res.available = TRUE`
    )
    const nearby = rRes.rows
      .map((r: any) => ({ ...r, distance_km: haversineDistance(latitude, longitude, r.latitude, r.longitude) }))
      .filter((r: any) => r.distance_km <= MAX_RADIUS_KM)
      .sort((a: any, b: any) => a.distance_km - b.distance_km)
      .slice(0, 5)

    // Alert each nearby resource manager
    for (const resource of nearby) {
      const msg = `🚨 SAFENET: "${title}" (${type}) reported ${resource.distance_km.toFixed(1)}km from ${resource.name}`
      if (resource.manager_phone) await sendSMS(resource.manager_phone, msg)
      if (resource.manager_email) await sendEmail({ to: resource.manager_email, subject: `Emergency Alert — ${title}`, text: msg })
      if (resource.manager_id) {
        const notif = await createNotif(resource.manager_id, emergency.id, msg)
        if (notif) io.to(`user_${resource.manager_id}`).emit('notification', notif)
      }
    }

    // Notify reporter
    if (req.user?.id) {
      const notif = await createNotif(
        req.user.id, emergency.id,
        `✅ Your emergency report "${title}" was submitted. ${nearby.length} nearby resource${nearby.length !== 1 ? 's' : ''} alerted.`
      )
      if (notif) io.to(`user_${req.user.id}`).emit('notification', notif)
    }

    // Get reporter name for admin audit
    let reporterName = 'Anonymous'
    if (req.user?.id) {
      const uRes = await pool.query('SELECT name FROM users WHERE id=$1', [req.user.id])
      if (uRes.rows[0]) reporterName = uRes.rows[0].name
    }

    // Notify all admins
    await notifyAllAdmins(
      emergency.id,
      `📋 New emergency: "${title}" (${type}) — reported by ${reporterName} — ${nearby.length} resource${nearby.length !== 1 ? 's' : ''} alerted`
    )

    io.emit('new_emergency', { emergency, nearbyResources: nearby })
    res.status(201).json({ emergency, nearbyResources: nearby })
  } catch (err: any) {
    console.error('reportEmergency ERROR:', err.message)
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
  } catch (err: any) {
    console.error('listEmergencies ERROR:', err.message)
    res.status(500).json({ error: 'Failed to fetch emergencies' })
  }
}

export const getEmergency = async (req: AuthRequest, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT e.*, u.name AS reported_by_name FROM emergencies e
       LEFT JOIN users u ON u.id = e.reported_by WHERE e.id=$1`,
      [req.params.id]
    )
    if (!r.rows[0]) return res.status(404).json({ error: 'Emergency not found' })
    res.json(r.rows[0])
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch emergency' })
  }
}

export const updateEmergencyStatus = async (req: AuthRequest, res: Response) => {
  const { id } = req.params
  const { status } = req.body
  const role = req.user?.role
  console.log(`updateStatus — id:${id}, status:${status}, role:${role}, actor:${req.user?.id}`)

  const validStatuses = ['pending', 'responding', 'resolved', 'cancelled']
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' })

  if (role === 'user') {
    if (status !== 'cancelled') return res.status(403).json({ error: 'Users can only cancel emergencies' })
    const chk = await pool.query('SELECT reported_by FROM emergencies WHERE id=$1', [id])
    if (!chk.rows[0]) return res.status(404).json({ error: 'Emergency not found' })
    if (chk.rows[0].reported_by !== req.user?.id) return res.status(403).json({ error: 'Can only cancel your own' })
  }

  try {
    const r = await pool.query(
      'UPDATE emergencies SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *',
      [status, id]
    )
    if (!r.rows[0]) return res.status(404).json({ error: 'Emergency not found' })
    const updated = r.rows[0]

    // Get names for rich notifications
    let reporterName = 'Anonymous'
    let actorName = 'System'
    if (updated.reported_by) {
      const uRes = await pool.query('SELECT name FROM users WHERE id=$1', [updated.reported_by])
      if (uRes.rows[0]) reporterName = uRes.rows[0].name
    }
    if (req.user?.id) {
      const aRes = await pool.query('SELECT name, role FROM users WHERE id=$1', [req.user.id])
      if (aRes.rows[0]) actorName = aRes.rows[0].name
    }

    const now = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

    // Notify reporter
    const reporterMsgs: Record<string, string> = {
      responding: `⚡ Help is on the way! ${actorName} (resource manager) is now responding to your emergency: "${updated.title}"`,
      resolved: `🎉 Your emergency "${updated.title}" has been resolved by ${actorName}. Stay safe!`,
      cancelled: `Your emergency report "${updated.title}" was rejected by ${actorName}.`,
    }
    if (updated.reported_by && reporterMsgs[status]) {
      const notif = await createNotif(updated.reported_by, updated.id, reporterMsgs[status])
      if (notif) io.to(`user_${updated.reported_by}`).emit('notification', notif)
    }

    // Rich audit notification for admins
    const adminMsgs: Record<string, string> = {
      responding: `⚡ ${actorName} (manager) accepted emergency "${updated.title}" — reported by ${reporterName} — ${now}`,
      resolved: `✅ ${actorName} (manager) resolved emergency "${updated.title}" — reported by ${reporterName} — ${now}`,
      cancelled: `✕ ${actorName} (manager) rejected emergency "${updated.title}" — reported by ${reporterName} — ${now}`,
      pending: `↩ Emergency "${updated.title}" reset to pending by ${actorName} — ${now}`,
    }
    if (adminMsgs[status]) {
      await notifyAllAdmins(updated.id, adminMsgs[status])
    }

    io.emit('emergency_updated', updated)
    res.json(updated)
  } catch (err: any) {
    console.error('updateEmergencyStatus ERROR:', err.message)
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
      SELECT DATE(created_at) AS day, COUNT(*) AS count FROM emergencies
      WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY day ORDER BY day`)
    res.json({ summary: summary.rows[0], byType: byType.rows, byDay: byDay.rows })
  } catch (err: any) {
    console.error('getStats ERROR:', err.message)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
}