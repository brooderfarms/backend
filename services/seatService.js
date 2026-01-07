const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditService = require('./auditService');

class SeatService {
  /**
   * Create seats for an event
   */
  async createSeats(eventId, seatsData, userId) {
    try {
      const seatsToInsert = seatsData.map(seat => ({
        id: uuidv4(),
        event_id: eventId,
        section: seat.section,
        row: seat.row,
        seat_number: seat.seat_number,
        price: seat.price,
        price_tier: seat.price_tier,
        accessibility_type: seat.accessibility_type || null,
        status: 'available',
        created_at: new Date()
      }));

      const createdSeats = await db('seats')
        .insert(seatsToInsert)
        .returning('*');

      await auditService.log({
        userId,
        action: 'SEATS_CREATED',
        resource: 'seats',
        resourceId: eventId,
        newValues: { seatCount: createdSeats.length }
      });

      return createdSeats;
    } catch (error) {
      console.error('Create seats error:', error);
      throw error;
    }
  }

  /**
   * Get available seats for an event
   */
  async getAvailableSeats(eventId, filters = {}) {
    try {
      const { section, row, limit = 100 } = filters;

      let query = db('seats')
        .where('event_id', eventId)
        .where('status', 'available')
        .whereNull('deleted_at');

      if (section) {
        query = query.where('section', section);
      }

      if (row) {
        query = query.where('row', row);
      }

      const seats = await query
        .select('*')
        .orderBy('section')
        .orderBy('row')
        .orderBy('seat_number')
        .limit(limit);

      return seats;
    } catch (error) {
      console.error('Get available seats error:', error);
      throw error;
    }
  }

  /**
   * Get seat map for an event
   */
  async getSeatMap(eventId) {
    try {
      const seats = await db('seats')
        .where('event_id', eventId)
        .whereNull('deleted_at')
        .select('*')
        .orderBy('section')
        .orderBy('row')
        .orderBy('seat_number');

      // Group by section
      const seatsBySection = {};
      seats.forEach(seat => {
        if (!seatsBySection[seat.section]) {
          seatsBySection[seat.section] = [];
        }
        seatsBySection[seat.section].push(seat);
      });

      // Get statistics
      const stats = await db('seats')
        .where('event_id', eventId)
        .whereNull('deleted_at')
        .select(
          db.raw('COUNT(*) as total'),
          db.raw('COUNT(CASE WHEN status = \'available\' THEN 1 END) as available'),
          db.raw('COUNT(CASE WHEN status = \'reserved\' THEN 1 END) as reserved'),
          db.raw('COUNT(CASE WHEN status = \'sold\' THEN 1 END) as sold'),
          db.raw('COUNT(CASE WHEN accessibility_type IS NOT NULL THEN 1 END) as accessible')
        )
        .first();

      return {
        seatsBySection,
        statistics: stats
      };
    } catch (error) {
      console.error('Get seat map error:', error);
      throw error;
    }
  }

  /**
   * Reserve seats for a user
   */
  async reserveSeats(eventId, seatIds, userId) {
    try {
      // Check seats availability
      const availableSeats = await db('seats')
        .whereIn('id', seatIds)
        .where('event_id', eventId)
        .where('status', 'available')
        .whereNull('deleted_at')
        .select('*');

      if (availableSeats.length !== seatIds.length) {
        throw new Error('One or more seats are not available');
      }

      const reservationId = uuidv4();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Create reservation
      const reservation = await db('seat_reservations')
        .insert({
          id: reservationId,
          event_id: eventId,
          user_id: userId,
          seat_ids: JSON.stringify(seatIds),
          status: 'pending',
          expires_at: expiresAt,
          created_at: new Date()
        })
        .returning('*');

      // Mark seats as reserved
      await db('seats')
        .whereIn('id', seatIds)
        .update({
          status: 'reserved',
          reserved_by: userId,
          reserved_at: new Date(),
          reservation_id: reservationId
        });

      await auditService.log({
        userId,
        action: 'SEATS_RESERVED',
        resource: 'seats',
        resourceId: eventId,
        newValues: { seatCount: seatIds.length }
      });

      return {
        reservationId,
        seats: availableSeats,
        expiresAt,
        totalPrice: availableSeats.reduce((sum, seat) => sum + (seat.price || 0), 0)
      };
    } catch (error) {
      console.error('Reserve seats error:', error);
      throw error;
    }
  }

  /**
   * Release reserved seats
   */
  async releaseReservation(reservationId, userId) {
    try {
      const reservation = await db('seat_reservations')
        .where('id', reservationId)
        .where('user_id', userId)
        .where('status', 'pending')
        .first();

      if (!reservation) {
        throw new Error('Reservation not found or already processed');
      }

      const seatIds = JSON.parse(reservation.seat_ids);

      // Release seats
      await db('seats')
        .whereIn('id', seatIds)
        .update({
          status: 'available',
          reserved_by: null,
          reserved_at: null,
          reservation_id: null
        });

      // Update reservation
      await db('seat_reservations')
        .where('id', reservationId)
        .update({
          status: 'released',
          released_at: new Date()
        });

      await auditService.log({
        userId,
        action: 'SEATS_RELEASED',
        resource: 'seats',
        resourceId: reservation.event_id,
        newValues: { seatCount: seatIds.length }
      });

      return { releasedSeatsCount: seatIds.length };
    } catch (error) {
      console.error('Release reservation error:', error);
      throw error;
    }
  }

  /**
   * Confirm seat purchase
   */
  async confirmPurchase(reservationId, paymentId, userId) {
    try {
      const reservation = await db('seat_reservations')
        .where('id', reservationId)
        .where('user_id', userId)
        .where('status', 'pending')
        .first();

      if (!reservation) {
        throw new Error('Reservation not found');
      }

      const seatIds = JSON.parse(reservation.seat_ids);

      // Mark seats as sold
      await db('seats')
        .whereIn('id', seatIds)
        .update({
          status: 'sold',
          sold_by: userId,
          sold_at: new Date(),
          payment_id: paymentId,
          reservation_id: null
        });

      // Update reservation
      await db('seat_reservations')
        .where('id', reservationId)
        .update({
          status: 'confirmed',
          payment_id: paymentId,
          confirmed_at: new Date()
        });

      await auditService.log({
        userId,
        action: 'SEATS_PURCHASED',
        resource: 'seats',
        resourceId: reservation.event_id,
        newValues: { seatCount: seatIds.length, paymentId }
      });

      return { confirmedSeatsCount: seatIds.length };
    } catch (error) {
      console.error('Confirm purchase error:', error);
      throw error;
    }
  }

  /**
   * Get seat pricing tiers
   */
  async getPricingTiers(eventId) {
    try {
      const tiers = await db('seat_pricing_tiers')
        .where('event_id', eventId)
        .whereNull('deleted_at')
        .select('*')
        .orderBy('price', 'desc');

      return tiers;
    } catch (error) {
      console.error('Get pricing tiers error:', error);
      throw error;
    }
  }

  /**
   * Create pricing tier
   */
  async createPricingTier(eventId, tierData, userId) {
    try {
      const tier = {
        id: uuidv4(),
        event_id: eventId,
        name: tierData.name,
        description: tierData.description,
        price: tierData.price,
        section: tierData.section,
        created_at: new Date()
      };

      const [createdTier] = await db('seat_pricing_tiers')
        .insert(tier)
        .returning('*');

      await auditService.log({
        userId,
        action: 'PRICING_TIER_CREATED',
        resource: 'seat_pricing_tiers',
        resourceId: createdTier.id,
        newValues: { name: createdTier.name, price: createdTier.price }
      });

      return createdTier;
    } catch (error) {
      console.error('Create pricing tier error:', error);
      throw error;
    }
  }

  /**
   * Get seat statistics
   */
  async getStatistics(eventId) {
    try {
      const stats = await db('seats')
        .where('event_id', eventId)
        .whereNull('deleted_at')
        .select(
          db.raw('COUNT(*) as total_seats'),
          db.raw('COUNT(CASE WHEN status = \'available\' THEN 1 END) as available_seats'),
          db.raw('COUNT(CASE WHEN status = \'reserved\' THEN 1 END) as reserved_seats'),
          db.raw('COUNT(CASE WHEN status = \'sold\' THEN 1 END) as sold_seats'),
          db.raw('COUNT(CASE WHEN accessibility_type IS NOT NULL THEN 1 END) as accessible_seats'),
          db.raw('SUM(CASE WHEN status = \'sold\' THEN price ELSE 0 END) as total_revenue'),
          db.raw('AVG(CASE WHEN status = \'sold\' THEN price ELSE NULL END) as average_price')
        )
        .first();

      const occupancyRate = stats.total_seats > 0
        ? Math.round((stats.sold_seats / stats.total_seats) * 100)
        : 0;

      return {
        ...stats,
        occupancy_rate: occupancyRate
      };
    } catch (error) {
      console.error('Get statistics error:', error);
      throw error;
    }
  }

  /**
   * Get user's active reservations
   */
  async getUserReservations(userId, filters = {}) {
    try {
      const { page = 1, limit = 10, status = 'pending' } = filters;
      const offset = (page - 1) * limit;

      let query = db('seat_reservations')
        .leftJoin('events', 'seat_reservations.event_id', 'events.id')
        .where('seat_reservations.user_id', userId);

      if (status) {
        query = query.where('seat_reservations.status', status);
      }

      const totalQuery = query.clone().clearSelect().clearOrder().count('seat_reservations.id as count').first();
      const [reservations, total] = await Promise.all([
        query
          .select([
            'seat_reservations.*',
            'events.title as event_title',
            'events.start_date as event_start_date'
          ])
          .orderBy('seat_reservations.created_at', 'desc')
          .limit(limit)
          .offset(offset),
        totalQuery
      ]);

      const parsed = reservations.map(r => ({
        ...r,
        seat_ids: JSON.parse(r.seat_ids),
        seatCount: JSON.parse(r.seat_ids).length
      }));

      return {
        reservations: parsed,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.count),
          pages: Math.ceil(total.count / limit)
        }
      };
    } catch (error) {
      console.error('Get user reservations error:', error);
      throw error;
    }
  }

  /**
   * Clean up expired reservations
   */
  async cleanupExpiredReservations() {
    try {
      const now = new Date();

      // Get expired reservations
      const expiredReservations = await db('seat_reservations')
        .where('status', 'pending')
        .where('expires_at', '<', now)
        .select('*');

      if (expiredReservations.length === 0) {
        return { cleaned: 0 };
      }

      // Release all seats from expired reservations
      for (const reservation of expiredReservations) {
        const seatIds = JSON.parse(reservation.seat_ids);

        await db('seats')
          .whereIn('id', seatIds)
          .update({
            status: 'available',
            reserved_by: null,
            reserved_at: null,
            reservation_id: null
          });
      }

      // Mark reservations as expired
      const cleaned = await db('seat_reservations')
        .where('status', 'pending')
        .where('expires_at', '<', now)
        .update({
          status: 'expired',
          released_at: now
        });

      console.log(`Cleaned up ${cleaned} expired reservations`);
      return { cleaned };
    } catch (error) {
      console.error('Cleanup expired reservations error:', error);
      throw error;
    }
  }
}

module.exports = new SeatService();
