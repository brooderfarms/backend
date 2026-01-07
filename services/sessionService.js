const db = require('../config/database');
const auditService = require('./auditService');

class SessionService {
  /**
   * Create event session
   */
  async createSession(eventId, sessionData) {
    try {
      const {
        session_name,
        session_description,
        start_time,
        end_time,
        capacity,
        base_price
      } = sessionData;

      // Verify event exists
      const event = await db('events')
        .where({ id: eventId })
        .whereNull('deleted_at')
        .first();

      if (!event) {
        throw new Error('Event not found');
      }

      const [session] = await db('event_sessions').insert({
        event_id: eventId,
        session_name,
        session_description,
        start_time: new Date(start_time),
        end_time: new Date(end_time),
        capacity,
        available_seats: capacity,
        base_price
      }).returning('*');

      return session;
    } catch (error) {
      console.error('Create session error:', error);
      throw error;
    }
  }

  /**
   * Get sessions for event
   */
  async getEventSessions(eventId) {
    try {
      const sessions = await db('event_sessions')
        .where({ event_id: eventId })
        .whereNull('deleted_at')
        .where('is_active', true)
        .orderBy('start_time', 'asc');

      return sessions;
    } catch (error) {
      console.error('Get event sessions error:', error);
      throw error;
    }
  }

  /**
   * Get session by ID
   */
  async getSessionById(sessionId) {
    try {
      const session = await db('event_sessions')
        .where({ id: sessionId })
        .whereNull('deleted_at')
        .first();

      return session;
    } catch (error) {
      console.error('Get session error:', error);
      throw error;
    }
  }

  /**
   * Update session
   */
  async updateSession(sessionId, updateData) {
    try {
      const [session] = await db('event_sessions')
        .where({ id: sessionId })
        .update(updateData)
        .returning('*');

      return session;
    } catch (error) {
      console.error('Update session error:', error);
      throw error;
    }
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId) {
    try {
      await db('event_sessions')
        .where({ id: sessionId })
        .update({ deleted_at: new Date() });

      return { success: true };
    } catch (error) {
      console.error('Delete session error:', error);
      throw error;
    }
  }

  /**
   * Check session availability
   */
  async checkSessionAvailability(sessionId, quantity = 1) {
    try {
      const session = await db('event_sessions')
        .where({ id: sessionId })
        .whereNull('deleted_at')
        .first();

      if (!session) {
        throw new Error('Session not found');
      }

      if (session.available_seats < quantity) {
        return {
          available: false,
          message: `Only ${session.available_seats} seats available in this session`
        };
      }

      return {
        available: true,
        session
      };
    } catch (error) {
      console.error('Check session availability error:', error);
      throw error;
    }
  }

  /**
   * Reserve seats in session
   */
  async reserveSeats(sessionId, quantity) {
    try {
      const [session] = await db('event_sessions')
        .where({ id: sessionId })
        .update({
          available_seats: db.raw(`available_seats - ${quantity}`)
        })
        .returning('*');

      return session;
    } catch (error) {
      console.error('Reserve seats error:', error);
      throw error;
    }
  }

  /**
   * Release seats in session
   */
  async releaseSeats(sessionId, quantity) {
    try {
      const [session] = await db('event_sessions')
        .where({ id: sessionId })
        .update({
          available_seats: db.raw(`available_seats + ${quantity}`)
        })
        .returning('*');

      return session;
    } catch (error) {
      console.error('Release seats error:', error);
      throw error;
    }
  }

  /**
   * Get session stats
   */
  async getSessionStats(sessionId) {
    try {
      const session = await db('event_sessions')
        .where({ id: sessionId })
        .whereNull('deleted_at')
        .first();

      if (!session) {
        throw new Error('Session not found');
      }

      const ticketsCount = await db('tickets')
        .where({ session_id: sessionId })
        .whereIn('status', ['confirmed', 'reserved'])
        .count('id as count')
        .first();

      return {
        ...session,
        sold_seats: session.capacity - session.available_seats,
        total_tickets: parseInt(ticketsCount.count),
        occupancy_rate: ((session.capacity - session.available_seats) / session.capacity * 100).toFixed(2)
      };
    } catch (error) {
      console.error('Get session stats error:', error);
      throw error;
    }
  }
}

module.exports = new SessionService();
