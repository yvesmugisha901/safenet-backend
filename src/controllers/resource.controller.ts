import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { ResourceModel } from '../models/Resource'
import { haversineDistance } from '../utils/geo'

export const listResources = async (_req: AuthRequest, res: Response) => {
  try {
    const resources = await ResourceModel.findAll()
    res.json(resources)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch resources' })
  }
}

export const getMyResources = async (req: AuthRequest, res: Response) => {
  try {
    const resources = await ResourceModel.findByManager(req.user!.id)
    res.json(resources)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch my resources' })
  }
}

export const getNearbyResources = async (req: AuthRequest, res: Response) => {
  const lat = parseFloat(req.query.lat as string)
  const lng = parseFloat(req.query.lng as string)
  const radius = parseFloat(req.query.radius as string) || 10
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat and lng required' })
  try {
    const resources = await ResourceModel.findAvailable()
    const nearby = resources
      .map(r => ({ ...r, distance_km: haversineDistance(lat, lng, r.latitude, r.longitude) }))
      .filter(r => r.distance_km <= radius)
      .sort((a, b) => a.distance_km - b.distance_km)
    res.json(nearby)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch nearby resources' })
  }
}

export const getResource = async (req: AuthRequest, res: Response) => {
  try {
    const resource = await ResourceModel.findById(req.params.id)
    if (!resource) return res.status(404).json({ error: 'Resource not found' })
    res.json(resource)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch resource' })
  }
}

export const createResource = async (req: AuthRequest, res: Response) => {
  const { name, type, address, latitude, longitude, capacity, phone } = req.body
  try {
    const resource = await ResourceModel.create({
      name, type, address,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      capacity: parseInt(capacity) || 0,
      phone,
      manager_id: req.user!.id,
    })
    res.status(201).json(resource)
  } catch (err) {
    res.status(500).json({ error: 'Failed to create resource' })
  }
}

export const updateResource = async (req: AuthRequest, res: Response) => {
  try {
    const resource = await ResourceModel.findById(req.params.id)
    if (!resource) return res.status(404).json({ error: 'Resource not found' })
    // Managers can only update their own resources
    if (req.user!.role === 'resource_manager' && resource.manager_id !== req.user!.id) {
      return res.status(403).json({ error: 'You can only update your own resources' })
    }
    const updated = await ResourceModel.update(req.params.id, req.body)
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: 'Failed to update resource' })
  }
}

export const deleteResource = async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await ResourceModel.delete(req.params.id)
    if (!deleted) return res.status(404).json({ error: 'Resource not found' })
    res.json({ message: 'Resource deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete resource' })
  }
}