import { Response } from 'express'
import { AuthenticatedRequest } from '../middleware/auth'
import pool from '../config/db'
import { haversineDistance } from '../utils/geo'
import { sendSMS } from '../services/twilio.service'
import { sendEmail } from '../services/sendgrid.service'
import { io } from '../server'

// Priority config — how many resources to alert and max radius
const PRIORITY_CONFIG = {
  low: { maxResources: 3, radiusKm: 10 },
  medium: { maxResources: 5, radiusKm: 20 },
  high: { maxResources: 8, radiusKm: 30 },
  critical: { maxResources: 999, radiusKm: 999 }, // ALL available resources
}

async function createNotif(userId: string, emergencyId: string | null, message: string, channel = 'in_app') {
  try {
    const r = await pool.query(
      `INSERT INTO notifications (user_id, emergency_id, message, channel) VALUES ($1,$2,$3,$4) RETURNING *`,
      [userId, emergencyId, message, channel]
    )
    return r.rows[0]
  } catch (err: any) {
    console.error('createNotif error:', err.message)
    return null
  }
}

async function notifyAllAdmins(emergencyId: string | null, message: string) {
  try {
    const admins = await pool.query(`SELECT id FROM users WHERE role='admin'`)
    for (const admin of admins.rows) {
      const notif = await createNotif(admin.id, emergencyId, message)
      if (notif) io.to(`user_${admin.id}`).emit('notification', notif)
    }
  } catch (err: any) {
    console.error('notifyAllAdmins error:', err.message)
  }
}

export const reportEmergency = async (req: AuthenticatedRequest, res: Response) => {
  const { title, description, type, latitude, longitude, priority = 'medium' } = req.body

  const validPriorities = ['low', 'medium', 'high', 'critical']
  if (!validPriorities.includes(priority)) {
    return res.status(400).json({ error: 'Invalid priority. Must be low, medium, high or critical' })
  }

  try {
    const eRes = await pool.query(
      `INSERT INTO emergencies (title, description, type, latitude, longitude, reported_by, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [title, description || null, type, parseFloat(latitude), parseFloat(longitude), req.user?.id || null, priority]
    )
    const emergency = eRes.rows[0]

    const config = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG]
    console.log(`Emergency reported: priority=${priority}, maxResources=${config.maxResources}, radius=${config.radiusKm}km`)

    const rRes = await pool.query(
      `SELECT res.*, u.phone AS manager_phone, u.email AS manager_email
       FROM resources res LEFT JOIN users u ON u.id = res.manager_id
       WHERE res.available = TRUE`
    )

    let nearby = rRes.rows
      .map((r: any) => ({ ...r, distance_km: haversineDistance(latitude, longitude, r.latitude, r.longitude) }))
      .filter((r: any) => r.distance_km <= config.radiusKm)
      .sort((a: any, b: any) => a.distance_km - b.distance_km)
      .slice(0, config.maxResources)

    if (priority === 'critical') {
      nearby = rRes.rows.map((r: any) => ({
        ...r,
        distance_km: haversineDistance(latitude, longitude, r.latitude, r.longitude)
      })).sort((a: any, b: any) => a.distance_km - b.distance_km)
    }

    console.log(`Alerting ${nearby.length} resources`)

    for (const resource of nearby) {
      const priorityLabel = priority === 'critical' ? '🚨🚨 CRITICAL' :
        priority === 'high' ? '🔴 HIGH PRIORITY' :
          priority === 'medium' ? '⚠️' : '📋'
      const msg = `${priorityLabel} SAFENET: "${title}" (${type}) ${resource.distance_km.toFixed(1)}km from ${resource.name}`

      if (resource.manager_phone) await sendSMS(resource.manager_phone, msg)
      if (resource.manager_email) {
        await sendEmail({
          to: resource.manager_email,
          subject: `${priority === 'critical' ? '🚨 CRITICAL ' : ''}Emergency Alert — ${title}`,
          text: `${msg}\n\nPriority: ${priority.toUpperCase()}\nDescription: ${description || 'N/A'}\nLocation: ${latitude}, ${longitude}`,
        })
      }
      if (resource.manager_id) {
        const notif = await createNotif(resource.manager_id, emergency.id,
          `${priorityLabel} ${msg}`)
        if (notif) io.to(`user_${resource.manager_id}`).emit('notification', notif)
      }
    }

    if (req.user?.id) {
      const notif = await createNotif(
        req.user.id, emergency.id,
        `✅ Your ${priority} priority emergency "${title}" was submitted. ${nearby.length} resource${nearby.length !== 1 ? 's' : ''} alerted.`
      )
      if (notif) io.to(`user_${req.user.id}`).emit('notification', notif)
    }

    let reporterName = 'Anonymous'
    if (req.user?.id) {
      const uRes = await pool.query('SELECT name FROM users WHERE id=$1', [req.user.id])
      if (uRes.rows[0]) reporterName = uRes.rows[0].name
    }
    await notifyAllAdmins(emergency.id,
      `📋 New ${priority.toUpperCase()} emergency: "${title}" (${type}) — by ${reporterName} — ${nearby.length} resources alerted`
    )

    io.emit('new_emergency', { emergency, nearbyResources: nearby })
    res.status(201).json({ emergency, nearbyResources: nearby })
  } catch (err: any) {
    console.error('reportEmergency ERROR:', err.message)
    res.status(500).json({ error: 'Failed to report emergency' })
  }
}

export const listEmergencies = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT e.*,
              u.name AS reported_by_name,
              res.name AS assigned_resource_name,
              res.type AS assigned_resource_type
       FROM emergencies e
       LEFT JOIN users u ON u.id = e.reported_by
       LEFT JOIN resources res ON res.id = e.assigned_resource_id
       ORDER BY
         CASE e.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         e.created_at DESC`
    )
    res.json(r.rows)
  } catch (err: any) {
    console.error('listEmergencies ERROR:', err.message)
    res.status(500).json({ error: 'Failed to fetch emergencies' })
  }
}

export const getEmergency = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT e.*, u.name AS reported_by_name,
              res.name AS assigned_resource_name, res.type AS assigned_resource_type
       FROM emergencies e
       LEFT JOIN users u ON u.id = e.reported_by
       LEFT JOIN resources res ON res.id = e.assigned_resource_id
       WHERE e.id=$1`,
      [req.params.id]
    )
    if (!r.rows[0]) return res.status(404).json({ error: 'Emergency not found' })
    res.json(r.rows[0])
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch emergency' })
  }
}

export const updateEmergencyStatus = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params
  const { status, resource_id } = req.body
  const role = req.user?.role
  console.log(`updateStatus — id:${id}, status:${status}, role:${role}, resource:${resource_id}`)

  const validStatuses = ['pending', 'responding', 'resolved', 'cancelled']
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' })

  if (role === 'user') {
    if (status !== 'cancelled') return res.status(403).json({ error: 'Users can only cancel emergencies' })
    const chk = await pool.query('SELECT reported_by FROM emergencies WHERE id=$1', [id])
    if (!chk.rows[0]) return res.status(404).json({ error: 'Emergency not found' })
    if (chk.rows[0].reported_by !== req.user?.id) return res.status(403).json({ error: 'Can only cancel your own' })
  }

  try {
    let sql = 'UPDATE emergencies SET status=$1, updated_at=NOW()'
    const vals: any[] = [status]
    let idx = 2

    if (status === 'responding' && resource_id) {
      sql += `, assigned_resource_id=$${idx++}`
      vals.push(resource_id)
    }

    sql += ` WHERE id=$${idx} RETURNING *`
    vals.push(id)

    const r = await pool.query(sql, vals)
    if (!r.rows[0]) return res.status(404).json({ error: 'Emergency not found' })
    const updated = r.rows[0]

    let reporterName = 'Anonymous', actorName = 'System', resourceName = ''
    if (updated.reported_by) {
      const uRes = await pool.query('SELECT name FROM users WHERE id=$1', [updated.reported_by])
      if (uRes.rows[0]) reporterName = uRes.rows[0].name
    }
    if (req.user?.id) {
      const aRes = await pool.query('SELECT name FROM users WHERE id=$1', [req.user.id])
      if (aRes.rows[0]) actorName = aRes.rows[0].name
    }
    if (resource_id) {
      const resResult = await pool.query('SELECT name FROM resources WHERE id=$1', [resource_id])
      if (resResult.rows[0]) resourceName = ` via ${resResult.rows[0].name}`
    }

    const now = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

    const reporterMsgs: Record<string, string> = {
      responding: `⚡ Help is on the way! ${actorName}${resourceName} is now responding to "${updated.title}"`,
      resolved: `🎉 Your emergency "${updated.title}" has been resolved by ${actorName}${resourceName}. Stay safe!`,
      cancelled: `Your emergency "${updated.title}" was rejected by ${actorName}.`,
    }
    if (updated.reported_by && reporterMsgs[status]) {
      const notif = await createNotif(updated.reported_by, updated.id, reporterMsgs[status])
      if (notif) io.to(`user_${updated.reported_by}`).emit('notification', notif)
    }

    const adminMsgs: Record<string, string> = {
      responding: `⚡ ${actorName} (manager) accepted "${updated.title}"${resourceName} — reported by ${reporterName} — ${now}`,
      resolved: `✅ ${actorName} resolved "${updated.title}"${resourceName} — reported by ${reporterName} — ${now}`,
      cancelled: `✕ ${actorName} rejected "${updated.title}" — reported by ${reporterName} — ${now}`,
    }
    if (adminMsgs[status]) await notifyAllAdmins(updated.id, adminMsgs[status])

    io.emit('emergency_updated', updated)
    res.json(updated)
  } catch (err: any) {
    console.error('updateEmergencyStatus ERROR:', err.message)
    res.status(500).json({ error: 'Failed to update status' })
  }
}

export const getStats = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const summary = await pool.query(`
      SELECT COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status='pending')    AS pending,
        COUNT(*) FILTER (WHERE status='responding') AS responding,
        COUNT(*) FILTER (WHERE status='resolved')   AS resolved,
        COUNT(*) FILTER (WHERE status='cancelled')  AS cancelled,
        COUNT(*) FILTER (WHERE priority='critical') AS critical,
        COUNT(*) FILTER (WHERE priority='high')     AS high_priority
      FROM emergencies`)
    const byType = await pool.query(`SELECT type, COUNT(*) AS count FROM emergencies GROUP BY type ORDER BY count DESC`)
    const byPriority = await pool.query(`SELECT priority, COUNT(*) AS count FROM emergencies GROUP BY priority ORDER BY count DESC`)
    const byDay = await pool.query(`
      SELECT DATE(created_at) AS day, COUNT(*) AS count FROM emergencies
      WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY day ORDER BY day`)
    res.json({ summary: summary.rows[0], byType: byType.rows, byPriority: byPriority.rows, byDay: byDay.rows })
  } catch (err: any) {
    console.error('getStats ERROR:', err.message)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
}