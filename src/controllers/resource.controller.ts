import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import pool from '../config/db'
import { haversineDistance } from '../utils/geo'

export const listResources = async (_req: AuthRequest, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT res.*, u.name AS manager_name
       FROM resources res LEFT JOIN users u ON u.id = res.manager_id
       ORDER BY res.name`
    )
    res.json(r.rows)
  } catch (err) {
    console.error('listResources error:', err)
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
  } catch (err) {
    console.error('getMyResources error:', err)
    res.status(500).json({ error: 'Failed to fetch my resources' })
  }
}

export const getNearbyResources = async (req: AuthRequest, res: Response) => {
  const lat = parseFloat(req.query.lat as string)
  const lng = parseFloat(req.query.lng as string)
  const radius = parseFloat(req.query.radius as string) || 10
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat and lng required' })
  try {
    const r = await pool.query(`SELECT res.*, u.name AS manager_name FROM resources res LEFT JOIN users u ON u.id = res.manager_id WHERE res.available = TRUE`)
    const nearby = r.rows
      .map((row: any) => ({ ...row, distance_km: haversineDistance(lat, lng, row.latitude, row.longitude) }))
      .filter((row: any) => row.distance_km <= radius)
      .sort((a: any, b: any) => a.distance_km - b.distance_km)
    res.json(nearby)
  } catch (err) {
    console.error('getNearbyResources error:', err)
    res.status(500).json({ error: 'Failed to fetch nearby resources' })
  }
}

export const getResource = async (req: AuthRequest, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT res.*, u.name AS manager_name FROM resources res LEFT JOIN users u ON u.id = res.manager_id WHERE res.id = $1`,
      [req.params.id]
    )
    if (!r.rows[0]) return res.status(404).json({ error: 'Resource not found' })
    res.json(r.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch resource' })
  }
}

export const createResource = async (req: AuthRequest, res: Response) => {
  console.log('createResource body:', req.body)
  console.log('createResource user:', req.user)
  const { name, type, address, latitude, longitude, capacity, phone } = req.body
  try {
    const lat = parseFloat(latitude)
    const lng = parseFloat(longitude)
    const cap = parseInt(capacity) || 0
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'Invalid latitude or longitude' })
    const r = await pool.query(
      `INSERT INTO resources (name, type, address, latitude, longitude, capacity, phone, manager_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, type, address, lat, lng, cap, phone || null, req.user!.id]
    )
    console.log('Resource created:', r.rows[0])
    res.status(201).json(r.rows[0])
  } catch (err) {
    console.error('createResource error:', err)
    res.status(500).json({ error: 'Failed to create resource — check server logs' })
  }
}

export const updateResource = async (req: AuthRequest, res: Response) => {
  try {
    const check = await pool.query('SELECT * FROM resources WHERE id = $1', [req.params.id])
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
    const r = await pool.query(`UPDATE resources SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values)
    res.json(r.rows[0])
  } catch (err) {
    console.error('updateResource error:', err)
    res.status(500).json({ error: 'Failed to update resource' })
  }
}

export const deleteResource = async (req: AuthRequest, res: Response) => {
  try {
    const r = await pool.query('DELETE FROM resources WHERE id=$1', [req.params.id])
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ error: 'Resource not found' })
    res.json({ message: 'Resource deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete resource' })
  }
}