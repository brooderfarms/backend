const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { verifyToken, requireRole } = require('../middleware/auth');
const auditService = require('../services/auditService');

/**
 * Get all available seats for an event
 * GET /api/seats/event/:eventId
 */
router.get('/event/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { seat_section, seat_row, status = 'available' } = req.query;

    // Verify event exists
    const event = await db('events')
      .where('id', eventId)
      .whereNull('deleted_at')
      .first();

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    let query = db('seats')
      .where('event_id', eventId)
      .whereNull('deleted_at')
      .select('*');

    // Filter by section
    if (seat_section) {
      query = query.where('seat_section', seat_section);
    }

    // Filter by row
    if (seat_row) {
      query = query.where('seat_row', seat_row);
    }

    // Filter by status
    if (status) {
      query = query.where('status', status);
    }

    const seats = await query.orderBy('seat_section').orderBy('seat_row').orderBy('seat_number');

    res.json({
      success: true,
      data: {
        eventId,
        totalSeats: seats.length,
        seats
      }
    });
  } catch (error) {
    console.error('Get seats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch seats'
    });
  }
});

/**
 * Get seat map layout for an event
 * GET /api/seats/event/:eventId/map
 */
router.get('/event/:eventId/map', async (req, res) => {
  try {
    const { eventId } = req.params;

    // Verify event exists
    const event = await db('events')
      .where('id', eventId)
      .whereNull('deleted_at')
      .first();

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Get seat layout config from venue
    const venue = await db('venues')
      .where('id', event.venue_id)
      .select('layout_config')
      .first();

    // Get all seats grouped by section and row
    const seats = await db('seats')
      .where('event_id', eventId)
      .whereNull('deleted_at')
      .select(
        'seat_section',
        'seat_row',
        'seat_number',
        'status',
        'seat_type',
        db.raw('COUNT(*) as count')
      )
      .groupBy('seat_section', 'seat_row', 'seat_number', 'status', 'seat_type')
      .orderBy('seat_section')
      .orderBy('seat_row')
      .orderBy('seat_number');

    // Get pricing tiers for this event
    const pricingTiers = await db('seat_pricing_tiers')
      .where('event_id', eventId)
      .select('*');

    // Get seat statistics
    const stats = await db('seats')
      .where('event_id', eventId)
      .whereNull('deleted_at')
      .select(
        db.raw('COUNT(*) as total_seats'),
        db.raw('COUNT(CASE WHEN status = \'available\' THEN 1 END) as available_seats'),
        db.raw('COUNT(CASE WHEN status = \'reserved\' THEN 1 END) as reserved_seats'),
        db.raw('COUNT(CASE WHEN status = \'sold\' THEN 1 END) as sold_seats'),
        db.raw('COUNT(CASE WHEN accessibility_type IS NOT NULL THEN 1 END) as accessible_seats')
      )
      .first();

    res.json({
      success: true,
      data: {
        eventId,
        venueLayout: venue?.layout_config,
        seats,
        pricingTiers,
        statistics: stats
      }
    });
  } catch (error) {
    console.error('Get seat map error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch seat map'
    });
  }
});

/**
 * Get available seats by section
 * GET /api/seats/event/:eventId/section/:section
 */
router.get('/event/:eventId/section/:section', async (req, res) => {
  try {
    const { eventId, section } = req.params;

    const seats = await db('seats')
      .where('event_id', eventId)
      .where('section', section)
      .where('status', 'available')
      .whereNull('deleted_at')
      .select('*')
      .orderBy('row')
      .orderBy('seat_number');

    const stats = await db('seats')
      .where('event_id', eventId)
      .where('section', section)
      .whereNull('deleted_at')
      .select(
        db.raw('COUNT(*) as total'),
        db.raw('COUNT(CASE WHEN status = \'available\' THEN 1 END) as available'),
        db.raw('COUNT(CASE WHEN status = \'reserved\' THEN 1 END) as reserved'),
        db.raw('COUNT(CASE WHEN status = \'sold\' THEN 1 END) as sold')
      )
      .first();

    res.json({
      success: true,
      data: {
        section,
        seats,
        statistics: stats
      }
    });
  } catch (error) {
    console.error('Get section seats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch section seats'
    });
  }
      /**
       * Bulk create/update seat pricing tiers (zones) for an event (admin/organizer)
       * POST /api/seats/event/:eventId/pricing
       * Body: { tiers: [ {id?, name, price, color, section, description} ] }
       */
      router.post('/event/:eventId/pricing', verifyToken, requireRole('admin', 'organizer', 'venue_manager'), async (req, res) => {
        try {
          const { eventId } = req.params;
          const { tiers } = req.body;
          const userId = req.user.id;
          if (!Array.isArray(tiers) || tiers.length === 0) {
            return res.status(400).json({ success: false, message: 'tiers array required' });
          }
          // Verify event exists
          const event = await db('events').where('id', eventId).whereNull('deleted_at').first();
          if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
          }
          // Only allow organizer/venue_manager for their own events
          if (req.user.role !== 'admin' && event.organizer_id !== userId) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
          }
          const results = [];
          for (const tier of tiers) {
            if (tier.id) {
              // Update existing
              await db('seat_pricing_tiers')
                .where('id', tier.id)
                .where('event_id', eventId)
                .update({
                  name: tier.name,
                  price: tier.price,
                  color: tier.color,
                  section: tier.section,
                  description: tier.description,
                  deleted_at: null
                });
              results.push({ ...tier, updated: true });
            } else {
              // Create new
              const [created] = await db('seat_pricing_tiers')
                .insert({
                  id: uuidv4(),
                  event_id: eventId,
                  name: tier.name,
                  price: tier.price,
                  color: tier.color,
                  section: tier.section,
                  description: tier.description,
                  created_at: new Date()
                })
                .returning('*');
              results.push({ ...created, created: true });
            }
          }
          res.json({ success: true, data: { eventId, results } });
        } catch (error) {
          console.error('Bulk zone pricing update error:', error);
          res.status(500).json({ success: false, message: 'Failed to update zone pricing', error: error.message });
        }
      });
});

/**
 * Reserve seats for a user
 * POST /api/seats/reserve
 */
router.post('/reserve', verifyToken, async (req, res) => {
  try {
    const { eventId, seatIds } = req.body;
    const userId = req.user.id;

    if (!eventId || !seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'eventId and seatIds array are required'
      });
    }

    // Verify event exists
    const event = await db('events')
      .where('id', eventId)
      .whereNull('deleted_at')
      .first();

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check if seats exist and are available
    const seatsToReserve = await db('seats')
      .whereIn('id', seatIds)
      .where('event_id', eventId)
      .where('status', 'available')
      .whereNull('deleted_at');

    if (seatsToReserve.length !== seatIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more seats are not available',
        availableSeatsCount: seatsToReserve.length,
        requestedSeatsCount: seatIds.length
      });
    }

    // Create reservation record
    const reservationId = uuidv4();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

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

    // Reserve seats temporarily
    await db('seats')
      .whereIn('id', seatIds)
      .update({
        status: 'reserved',
        reserved_by: userId,
        reserved_at: new Date(),
        reservation_id: reservationId
      });

    // Log audit
    await auditService.log({
      userId,
      action: 'SEATS_RESERVED',
      resource: 'seats',
      resourceId: eventId,
      newValues: {
        eventId,
        seatCount: seatIds.length,
        reservationId
      }
    });

    res.status(201).json({
      success: true,
      message: 'Seats reserved successfully',
      data: {
        reservationId,
        seats: seatsToReserve,
        expiresAt,
        totalSeatsReserved: seatIds.length,
        totalPrice: seatsToReserve.reduce((sum, seat) => sum + (seat.price || 0), 0)
      }
    });
  } catch (error) {
    console.error('Reserve seats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reserve seats'
    });
  }
});

/**
 * Release reserved seats
 * POST /api/seats/release
 */
router.post('/release', verifyToken, async (req, res) => {
  try {
    const { reservationId } = req.body;
    const userId = req.user.id;

    if (!reservationId) {
      return res.status(400).json({
        success: false,
        message: 'reservationId is required'
      });
    }

    // Get reservation
    const reservation = await db('seat_reservations')
      .where('id', reservationId)
      .where('user_id', userId)
      .first();

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found'
      });
    }

    if (reservation.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot release ${reservation.status} reservation`
      });
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

    // Update reservation status
    await db('seat_reservations')
      .where('id', reservationId)
      .update({
        status: 'released',
        released_at: new Date()
      });

    // Log audit
    await auditService.log({
      userId,
      action: 'SEATS_RELEASED',
      resource: 'seats',
      resourceId: reservation.event_id,
      newValues: { seatCount: seatIds.length }
    });

    res.json({
      success: true,
      message: 'Seats released successfully',
      data: {
        releasedSeatsCount: seatIds.length
      }
    });
  } catch (error) {
    console.error('Release seats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to release seats'
    });
  }
});

/**
 * Confirm seat purchase (after payment)
 * POST /api/seats/confirm
 */
router.post('/confirm', verifyToken, async (req, res) => {
  try {
    const { reservationId, paymentId } = req.body;
    const userId = req.user.id;

    if (!reservationId || !paymentId) {
      return res.status(400).json({
        success: false,
        message: 'reservationId and paymentId are required'
      });
    }

    // Get reservation
    const reservation = await db('seat_reservations')
      .where('id', reservationId)
      .where('user_id', userId)
      .first();

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found'
      });
    }

    // Verify payment is confirmed
    const payment = await db('payments')
      .where('id', paymentId)
      .where('user_id', userId)
      .first();

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    if (payment.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Payment is not completed'
      });
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

    // Update reservation status
    await db('seat_reservations')
      .where('id', reservationId)
      .update({
        status: 'confirmed',
        payment_id: paymentId,
        confirmed_at: new Date()
      });

    // Log audit
    await auditService.log({
      userId,
      action: 'SEATS_CONFIRMED',
      resource: 'seats',
      resourceId: reservation.event_id,
      newValues: {
        seatCount: seatIds.length,
        paymentId
      }
    });

    res.json({
      success: true,
      message: 'Seats confirmed successfully',
      data: {
        confirmedSeatsCount: seatIds.length,
        reservationId,
        paymentId
      }
    });
  } catch (error) {
    console.error('Confirm seats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm seats'
    });
  }
});

/**
 * Get user's reservations
 * GET /api/seats/reservations
 */
router.get('/reservations', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    let query = db('seat_reservations')
      .leftJoin('events', 'seat_reservations.event_id', 'events.id')
      .where('seat_reservations.user_id', userId)
      .select([
        'seat_reservations.*',
        'events.title as event_title',
        'events.start_date as event_start_date'
      ]);

    if (status) {
      query = query.where('seat_reservations.status', status);
    }

    const totalQuery = query.clone().clearSelect().clearOrder().count('seat_reservations.id as count').first();
    const [reservations, total] = await Promise.all([
      query.orderBy('seat_reservations.created_at', 'desc').limit(limit).offset(offset),
      totalQuery
    ]);

    // Parse seat IDs
    const parsed = reservations.map(r => ({
      ...r,
      seat_ids: JSON.parse(r.seat_ids),
      seatCount: JSON.parse(r.seat_ids).length
    }));

    res.json({
      success: true,
      data: {
        reservations: parsed,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.count),
          pages: Math.ceil(total.count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get reservations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reservations'
    });
  }
});

/**
 * Get seat pricing tiers for an event
 * GET /api/seats/event/:eventId/pricing
 */
router.get('/event/:eventId/pricing', async (req, res) => {
  try {
    const { eventId } = req.params;

    const pricingTiers = await db('seat_pricing_tiers')
      .where('event_id', eventId)
      .whereNull('deleted_at')
      .select('*')
      .orderBy('price', 'desc');

    res.json({
      success: true,
      data: {
        eventId,
        pricingTiers
      }
    });
  } catch (error) {
    console.error('Get pricing tiers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pricing tiers'
    });
  }
});

/**
 * Create seats for an event (organizer/admin)
 * POST /api/seats/create-batch
 */
router.post('/create-batch', verifyToken, requireRole('organizer', 'venue_manager', 'admin'), async (req, res) => {
  try {
    const { eventId, seatsData } = req.body;
    const userId = req.user.id;

    if (!eventId || !seatsData || !Array.isArray(seatsData) || seatsData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'eventId and seatsData array are required'
      });
    }

    // Verify event exists and user can manage it
    const event = await db('events')
      .where('id', eventId)
      .whereNull('deleted_at')
      .first();

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check authorization
    if (req.user.role !== 'admin' && event.organizer_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create seats for this event'
      });
    }

    // Format seats with IDs
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

    // Log audit
    await auditService.log({
      userId,
      action: 'SEATS_BATCH_CREATED',
      resource: 'seats',
      resourceId: eventId,
      newValues: {
        seatCount: createdSeats.length
      }
    });

    res.status(201).json({
      success: true,
      message: `${createdSeats.length} seats created successfully`,
      data: {
        createdSeatsCount: createdSeats.length,
        seats: createdSeats
      }
    });
  } catch (error) {
    console.error('Create seats batch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create seats'
    });
  }
});

/**
 * Get seat statistics for event (organizer)
 * GET /api/seats/event/:eventId/stats
 */
router.get('/event/:eventId/stats', async (req, res) => {
  try {
    const { eventId } = req.params;

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
        db.raw('AVG(CASE WHEN status = \'sold\' THEN price ELSE NULL END) as average_seat_price')
      )
      .first();

    const occupancyRate = stats.total_seats > 0
      ? Math.round(((stats.sold_seats) / stats.total_seats) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        ...stats,
        occupancy_rate: occupancyRate
      }
    });
  } catch (error) {
    console.error('Get seat stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch seat statistics'
    });
  }
});

module.exports = router;
