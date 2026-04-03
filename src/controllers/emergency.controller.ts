import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { EmergencyModel } from '../models/Emergency'
import { ResourceModel } from '../models/Resource'
import { NotificationModel } from '../models/Notification'
import { haversineDistance } from '../utils/geo'
import { sendSMS } from '../services/twilio.service'
import { sendEmail } from '../services/sendgrid.service'
import { io } from '../server'

const MAX_RADIUS_KM = 20

export const reportEmergency = async (req: AuthRequest, res: Response) => {
  const { title, description, type, latitude, longitude } = req.body
  try {
    const emergency = await EmergencyModel.create({
      title, description, type,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      reported_by: req.user?.id,
    })

    const allResources = await ResourceModel.findAvailable()
    const nearby = allResources
      .map(r => ({
        ...r,
        distance_km: haversineDistance(latitude, longitude, r.latitude, r.longitude),
      }))
      .filter(r => r.distance_km <= MAX_RADIUS_KM)
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, 5)

    for (const resource of nearby) {
      const msg = `SAFENET: "${title}" (${type}) reported ${resource.distance_km.toFixed(1)}km from ${resource.name}`
      if ((resource as any).manager_phone) await sendSMS((resource as any).manager_phone, msg)
      if ((resource as any).manager_email) {
        await sendEmail({
          to: (resource as any).manager_email,
          subject: `Emergency Alert — ${title}`,
          text: `${msg}\n\nDescription: ${description || 'N/A'}\nLocation: ${latitude}, ${longitude}`,
        })
      }
      if (resource.manager_id) {
        const notif = await NotificationModel.create({
          user_id: resource.manager_id,
          emergency_id: emergency.id,
          message: msg,
          channel: 'in_app',
        })
        io.to(`user_${resource.manager_id}`).emit('notification', notif)
      }
    }

    io.emit('new_emergency', { emergency, nearbyResources: nearby })
    res.status(201).json({ emergency, nearbyResources: nearby })
  } catch (err) {
    console.error('Report emergency error:', err)
    res.status(500).json({ error: 'Failed to report emergency' })
  }
}

export const listEmergencies = async (_req: AuthRequest, res: Response) => {
  try {
    const emergencies = await EmergencyModel.findAll()
    res.json(emergencies)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch emergencies' })
  }
}

export const getEmergency = async (req: AuthRequest, res: Response) => {
  try {
    const emergency = await EmergencyModel.findById(req.params.id)
    if (!emergency) return res.status(404).json({ error: 'Emergency not found' })
    res.json(emergency)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch emergency' })
  }
}

export const updateEmergencyStatus = async (req: AuthRequest, res: Response) => {
  const { id } = req.params
  const { status } = req.body
  const validStatuses = ['pending', 'responding', 'resolved', 'cancelled']
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' })
  }
  try {
    const updated = await EmergencyModel.updateStatus(id, status, req.user?.id)
    if (!updated) return res.status(404).json({ error: 'Emergency not found' })
    io.emit('emergency_updated', updated)
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status' })
  }
}

export const getStats = async (_req: AuthRequest, res: Response) => {
  try {
    const stats = await EmergencyModel.getStats()
    res.json(stats)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
}