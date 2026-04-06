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
      .map(r => ({ ...r, distance_km: haversineDistance(latitude, longitude, r.latitude, r.longitude) }))
      .filter(r => r.distance_km <= MAX_RADIUS_KM)
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, 5)

    for (const resource of nearby) {
      const msg = `SAFENET ALERT: "${title}" (${type}) reported ${resource.distance_km.toFixed(1)}km from ${resource.name}`
      if ((resource as any).manager_phone) await sendSMS((resource as any).manager_phone, msg)
      if ((resource as any).manager_email) {
        await sendEmail({
          to: (resource as any).manager_email,
          subject: `Emergency Alert — ${title}`,
          text: `${msg}\n\nDetails: ${description || 'N/A'}\nLocation: ${latitude}, ${longitude}`,
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

    // Notify the reporter too
    if (req.user?.id) {
      const reporterNotif = await NotificationModel.create({
        user_id: req.user.id,
        emergency_id: emergency.id,
        message: `Your emergency report "${title}" has been submitted. Nearby resource managers have been alerted.`,
        channel: 'in_app',
      })
      io.to(`user_${req.user.id}`).emit('notification', reporterNotif)
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
  const role = req.user?.role

  console.log(`Status update — user: ${req.user?.id}, role: ${role}, status: ${status}, id: ${id}`)

  const validStatuses = ['pending', 'responding', 'resolved', 'cancelled']
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' })
  }

  // Users can only cancel their own
  if (role === 'user') {
    if (status !== 'cancelled') {
      return res.status(403).json({ error: 'Users can only cancel emergencies' })
    }
    const e = await EmergencyModel.findById(id)
    if (!e) return res.status(404).json({ error: 'Emergency not found' })
    if (e.reported_by !== req.user?.id) {
      return res.status(403).json({ error: 'You can only cancel your own emergencies' })
    }
  }

  try {
    const updated = await EmergencyModel.updateStatus(id, status)
    if (!updated) return res.status(404).json({ error: 'Emergency not found' })

    // Notify the original reporter of status changes
    if (updated.reported_by) {
      const messages: Record<string, string> = {
        responding: `✅ A resource manager is now responding to your emergency: "${updated.title}"`,
        resolved: `🎉 Your emergency "${updated.title}" has been resolved. Stay safe!`,
        cancelled: `Your emergency report "${updated.title}" was rejected by the resource manager.`,
      }
      if (messages[status]) {
        const notif = await NotificationModel.create({
          user_id: updated.reported_by,
          emergency_id: updated.id,
          message: messages[status],
          channel: 'in_app',
        })
        io.to(`user_${updated.reported_by}`).emit('notification', notif)
      }
    }

    io.emit('emergency_updated', updated)
    res.json(updated)
  } catch (err) {
    console.error('Update status error:', err)
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