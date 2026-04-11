import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import pool from '../config/db'
import { haversineDistance } from '../utils/geo'
import { io } from '../server'

async function notifyAdmins(message: string) {
  try {
    const admins = await pool.query(`SELECT id FROM users WHERE role='admin'`)
    for (const admin of admins.rows) {
      const notif = await pool.query(
        `INSERT INTO notifications (user_id, message, channel) VALUES ($1,$2,'in_app') RETURNING *`,
        [admin.id, message]
      )
      io.to(`user_${admin.id}`).emit('notification', notif.rows[0])
    }
  } catch (err: any) {
    console.error('notifyAdmins error:', err.message)
  }
}

export const listResources = async (_req: AuthRequest, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT res.*, u.name AS manager_name
       FROM resources res LEFT JOIN users u ON u.id = res.manager_id
       ORDER BY res.name`
    )
    res.json(r.rows)
  } catch (err: any) {
    console.error('listResources error:', err.message)
    res.status(500).json({ error: 'Failed to fetch resources' })
  }
}

export const getMyResources = async (req: AuthRequest, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT res.*, u.name AS manager_name
       FROM resources res LEFT JOIN users u ON u.id = res.manager_id
       WHERE res.manager_id = $1 ORDER BY res.name`,
      [req.user!.id]
    )
    res.json(r.rows)
  } catch (err: any) {
    console.error('getMyResources error:', err.message)
    res.status(500).json({ error: 'Failed to fetch my resources' })
  }
}

export const getNearbyResources = async (req: AuthRequest, res: Response) => {
  const lat = parseFloat(req.query.lat as string)
  const lng = parseFloat(req.query.lng as string)
  const radius = parseFloat(req.query.radius as string) || 10
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat and lng required' })
  try {
    const r = await pool.query(
      `SELECT res.*, u.name AS manager_name
       FROM resources res LEFT JOIN users u ON u.id = res.manager_id
       WHERE res.available = TRUE`
    )
    const nearby = r.rows
      .map((row: any) => ({ ...row, distance_km: haversineDistance(lat, lng, row.latitude, row.longitude) }))
      .filter((row: any) => row.distance_km <= radius)
      .sort((a: any, b: any) => a.distance_km - b.distance_km)
    res.json(nearby)
  } catch (err: any) {
    console.error('getNearbyResources error:', err.message)
    res.status(500).json({ error: 'Failed to fetch nearby resources' })
  }
}

export const getResource = async (req: AuthRequest, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT res.*, u.name AS manager_name
       FROM resources res LEFT JOIN users u ON u.id = res.manager_id
       WHERE res.id = $1`,
      [req.params.id]
    )
    if (!r.rows[0]) return res.status(404).json({ error: 'Resource not found' })
    res.json(r.rows[0])
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch resource' })
  }
}

export const createResource = async (req: AuthRequest, res: Response) => {
  console.log('createResource — body:', req.body, '| user:', req.user?.id, req.user?.role)
  const { name, type, address, latitude, longitude, capacity, phone } = req.body
  try {
    const lat = parseFloat(latitude)
    const lng = parseFloat(longitude)
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'Invalid latitude or longitude' })

    const r = await pool.query(
      `INSERT INTO resources (name,type,address,latitude,longitude,capacity,phone,manager_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, type, address, lat, lng, parseInt(capacity) || 0, phone || null, req.user!.id]
    )
    const resource = r.rows[0]
    console.log('Resource created successfully:', resource.id)

    // Get manager name for admin notification
    const managerRes = await pool.query('SELECT name FROM users WHERE id=$1', [req.user!.id])
    const managerName = managerRes.rows[0]?.name || 'A resource manager'
    const now = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

    // Notify all admins
    await notifyAdmins(
      `🏥 ${managerName} added a new resource: "${name}" (${type.replace('_', ' ')}) at ${address} — ${now}`
    )

    res.status(201).json(resource)
  } catch (err: any) {
    console.error('createResource ERROR:', err.message, err.stack)
    res.status(500).json({ error: `Failed to create resource: ${err.message}` })
  }
}

export const updateResource = async (req: AuthRequest, res: Response) => {
  try {
    const check = await pool.query('SELECT * FROM resources WHERE id=$1', [req.params.id])
    if (!check.rows[0]) return res.status(404).json({ error: 'Resource not found' })
    if (req.user!.role === 'resource_manager' && check.rows[0].manager_id !== req.user!.id) {
      return res.status(403).json({ error: 'You can only update your own resources' })
    }
    const { name, available, capacity, phone, address } = req.body
    const fields: string[] = []
    const values: any[] = []
    let i = 1
    if (name !== undefined) { fields.push(`name=$${i++}`); values.push(name) }
    if (available !== undefined) { fields.push(`available=$${i++}`); values.push(available) }
    if (capacity !== undefined) { fields.push(`capacity=$${i++}`); values.push(capacity) }
    if (phone !== undefined) { fields.push(`phone=$${i++}`); values.push(phone) }
    if (address !== undefined) { fields.push(`address=$${i++}`); values.push(address) }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' })
    fields.push(`updated_at=NOW()`)
    values.push(req.params.id)
    const r = await pool.query(
      `UPDATE resources SET ${fields.join(',')} WHERE id=$${i} RETURNING *`,
      values
    )
    res.json(r.rows[0])
  } catch (err: any) {
    console.error('updateResource error:', err.message)
    res.status(500).json({ error: 'Failed to update resource' })
  }
}

export const deleteResource = async (req: AuthRequest, res: Response) => {
  try {
    const r = await pool.query('DELETE FROM resources WHERE id=$1', [req.params.id])
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ error: 'Resource not found' })
    res.json({ message: 'Resource deleted' })
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete resource' })
  }
}