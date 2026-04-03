import pool from '../config/db'

export interface Emergency {
    id: string
    title: string
    description?: string
    type: 'medical' | 'fire' | 'flood' | 'accident' | 'crime' | 'other'
    status: 'pending' | 'responding' | 'resolved' | 'cancelled'
    latitude: number
    longitude: number
    reported_by?: string
    reported_by_name?: string
    assigned_to?: string
    created_at: string
    updated_at: string
}

export const EmergencyModel = {
    findAll: async (): Promise<Emergency[]> => {
        const result = await pool.query(
            `SELECT e.*, u.name AS reported_by_name
       FROM emergencies e
       LEFT JOIN users u ON u.id = e.reported_by
       ORDER BY e.created_at DESC`
        )
        return result.rows
    },

    findById: async (id: string): Promise<Emergency | null> => {
        const result = await pool.query(
            `SELECT e.*, u.name AS reported_by_name
       FROM emergencies e
       LEFT JOIN users u ON u.id = e.reported_by
       WHERE e.id = $1`,
            [id]
        )
        return result.rows[0] || null
    },

    findByStatus: async (status: string): Promise<Emergency[]> => {
        const result = await pool.query(
            `SELECT e.*, u.name AS reported_by_name
       FROM emergencies e
       LEFT JOIN users u ON u.id = e.reported_by
       WHERE e.status = $1
       ORDER BY e.created_at DESC`,
            [status]
        )
        return result.rows
    },

    create: async (data: {
        title: string; description?: string; type: string
        latitude: number; longitude: number; reported_by?: string
    }): Promise<Emergency> => {
        const result = await pool.query(
            `INSERT INTO emergencies (title, description, type, latitude, longitude, reported_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [data.title, data.description || null, data.type,
            data.latitude, data.longitude, data.reported_by || null]
        )
        return result.rows[0]
    },

    updateStatus: async (id: string, status: string, assignedTo?: string): Promise<Emergency | null> => {
        const result = await pool.query(
            `UPDATE emergencies
       SET status = $1, assigned_to = COALESCE($2, assigned_to), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
            [status, assignedTo || null, id]
        )
        return result.rows[0] || null
    },

    getStats: async () => {
        const summary = await pool.query(`
      SELECT
        COUNT(*)                                          AS total,
        COUNT(*) FILTER (WHERE status = 'pending')       AS pending,
        COUNT(*) FILTER (WHERE status = 'responding')    AS responding,
        COUNT(*) FILTER (WHERE status = 'resolved')      AS resolved,
        COUNT(*) FILTER (WHERE status = 'cancelled')     AS cancelled
      FROM emergencies
    `)
        const byType = await pool.query(
            `SELECT type, COUNT(*) AS count FROM emergencies GROUP BY type ORDER BY count DESC`
        )
        const byDay = await pool.query(`
      SELECT DATE(created_at) AS day, COUNT(*) AS count
      FROM emergencies
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY day ORDER BY day
    `)
        return { summary: summary.rows[0], byType: byType.rows, byDay: byDay.rows }
    },
}