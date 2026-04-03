import pool from '../config/db'

export interface Notification {
    id: string
    user_id: string
    emergency_id?: string
    message: string
    channel: 'sms' | 'email' | 'in_app'
    read: boolean
    sent_at: string
}

export const NotificationModel = {
    findByUser: async (userId: string): Promise<Notification[]> => {
        const result = await pool.query(
            `SELECT * FROM notifications WHERE user_id = $1 ORDER BY sent_at DESC LIMIT 50`,
            [userId]
        )
        return result.rows
    },

    create: async (data: {
        user_id: string; emergency_id?: string
        message: string; channel: string
    }): Promise<Notification> => {
        const result = await pool.query(
            `INSERT INTO notifications (user_id, emergency_id, message, channel)
       VALUES ($1,$2,$3,$4) RETURNING *`,
            [data.user_id, data.emergency_id || null, data.message, data.channel]
        )
        return result.rows[0]
    },

    markRead: async (id: string, userId: string): Promise<boolean> => {
        const result = await pool.query(
            `UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2`,
            [id, userId]
        )
        return (result.rowCount ?? 0) > 0
    },

    markAllRead: async (userId: string): Promise<void> => {
        await pool.query(
            `UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE`,
            [userId]
        )
    },

    unreadCount: async (userId: string): Promise<number> => {
        const result = await pool.query(
            `SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND read = FALSE`,
            [userId]
        )
        return parseInt(result.rows[0].count)
    },
}