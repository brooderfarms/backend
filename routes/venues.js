const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireRole } = require('../middleware/auth');
const { validatePagination, validateUUID, validateVenueCreation } = require('../middleware/validation');

// Get all venues (public access)
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      city,
      venue_type,
      manager_id,
      sort_by = 'name',
      sort_order = 'asc'
    } = req.query;

    const offset = (page - 1) * limit;

    let query = db('venues')
      .leftJoin('users as managers', 'venues.manager_id', 'managers.id')
      .whereNull('venues.deleted_at')
      .select([
        'venues.*',
        'managers.first_name as manager_first_name',
        'managers.last_name as manager_last_name'
      ]);

    // Apply filters
    if (search) {
      query = query.where(function() {
        this.where('venues.name', 'ilike', `%${search}%`)
          .orWhere('venues.description', 'ilike', `%${search}%`)
          .orWhere('venues.city', 'ilike', `%${search}%`);
      });
    }

    if (city) {
      query = query.where('venues.city', 'ilike', `%${city}%`);
    }

    if (venue_type) {
      query = query.where('venues.venue_type', venue_type);
    }

    if (manager_id) {
      query = query.where('venues.manager_id', manager_id);
    }

    // Apply sorting
    query = query.orderBy(`venues.${sort_by}`, sort_order);

    // Get total count for pagination
    const totalQuery = query.clone().clearSelect().clearOrder().count('* as count').first();
    const [venues, total] = await Promise.all([
      query.limit(limit).offset(offset),
      totalQuery
    ]);

    res.json({
      success: true,
      data: {
        venues,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.count),
          pages: Math.ceil(total.count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get venues error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch venues'
    });
  }
});

// Get venue by ID (public access)
router.get('/:id', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const venue = await db('venues')
      .leftJoin('users as managers', 'venues.manager_id', 'managers.id')
      .where('venues.id', id)
      .whereNull('venues.deleted_at')
      .select([
        'venues.*',
        'managers.first_name as manager_first_name',
        'managers.last_name as manager_last_name',
        'managers.email as manager_email'
      ])
      .first();

    if (!venue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    // Get upcoming events at this venue
    const upcomingEvents = await db('events')
      .where('venue_id', id)
      .where('status', 'published')
      .where('start_date', '>', new Date())
      .whereNull('deleted_at')
      .select(['id', 'title', 'start_date', 'event_type', 'category'])
      .orderBy('start_date', 'asc')
      .limit(5);

    venue.upcoming_events = upcomingEvents;

    res.json({
      success: true,
      data: venue
    });
  } catch (error) {
    console.error('Get venue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch venue'
    });
  }
});

// Create new venue (admin only)
router.post('/', verifyToken, requireRole('admin'), validateVenueCreation, async (req, res) => {
  try {
    const venueData = req.body;

    const [venue] = await db('venues')
      .insert(venueData)
      .returning('*');

    // Log audit event
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'VENUE_CREATED',
      resource: 'venues',
      resource_id: venue.id,
      new_values: JSON.stringify(venue),
      timestamp: new Date()
    });

    res.status(201).json({
      success: true,
      message: 'Venue created successfully',
      data: venue
    });
  } catch (error) {
    console.error('Create venue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create venue'
    });
  }
});

// Update venue (admin or venue manager)
router.put('/:id', verifyToken, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check permissions
    if (req.user.role !== 'admin') {
      const venue = await db('venues').where({ id }).first();
      if (!venue || venue.manager_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You can only update venues you manage'
        });
      }
    }

    // Remove fields that shouldn't be updated directly
    delete updateData.id;
    delete updateData.created_at;
    delete updateData.deleted_at;

    updateData.updated_at = new Date();

    const [updatedVenue] = await db('venues')
      .where({ id })
      .update(updateData)
      .returning('*');

    if (!updatedVenue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    // Log audit event
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'VENUE_UPDATED',
      resource: 'venues',
      resource_id: id,
      new_values: JSON.stringify(updateData),
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Venue updated successfully',
      data: updatedVenue
    });
  } catch (error) {
    console.error('Update venue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update venue'
    });
  }
});

// Soft delete venue (admin only)
router.delete('/:id', verifyToken, requireRole('admin'), validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const [deletedVenue] = await db('venues')
      .where({ id })
      .update({
        deleted_at: new Date(),
        is_active: false
      })
      .returning(['id', 'name']);

    if (!deletedVenue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    // Log audit event
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'VENUE_DELETED',
      resource: 'venues',
      resource_id: id,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Venue deleted successfully'
    });
  } catch (error) {
    console.error('Delete venue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete venue'
    });
  }
});

// Get venue statistics (admin or venue manager)
router.get('/:id/stats', verifyToken, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    // Check permissions
    if (req.user.role !== 'admin') {
      const venue = await db('venues').where({ id }).first();
      if (!venue || venue.manager_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You can only view statistics for venues you manage'
        });
      }
    }

    // Get venue stats
    const stats = await db('events')
      .where('venue_id', id)
      .whereNull('deleted_at')
      .select(
        db.raw('COUNT(*) as total_events'),
        db.raw('COUNT(CASE WHEN status = \'published\' THEN 1 END) as published_events'),
        db.raw('COUNT(CASE WHEN status = \'completed\' THEN 1 END) as completed_events'),
        db.raw('COUNT(CASE WHEN start_date > NOW() THEN 1 END) as upcoming_events')
      )
      .first();

    // Get ticket sales stats
    const ticketStats = await db('tickets')
      .join('events', 'tickets.event_id', 'events.id')
      .where('events.venue_id', id)
      .whereIn('tickets.status', ['confirmed', 'used'])
      .select(
        db.raw('COUNT(tickets.id) as total_tickets_sold'),
        db.raw('SUM(tickets.total_amount) as total_revenue')
      )
      .first();

    const combinedStats = {
      ...stats,
      total_tickets_sold: parseInt(ticketStats.total_tickets_sold) || 0,
      total_revenue: parseFloat(ticketStats.total_revenue) || 0
    };

    res.json({
      success: true,
      data: combinedStats
    });
  } catch (error) {
    console.error('Get venue stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch venue statistics'
    });
  }
});

// Get venue events (public access)
router.get('/:id/events', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, limit = 10 } = req.query;

    let query = db('events')
      .where('venue_id', id)
      .whereNull('deleted_at')
      .select(['id', 'title', 'start_date', 'end_date', 'event_type', 'category', 'status', 'base_price'])
      .orderBy('start_date', 'asc');

    if (status) {
      query = query.where('status', status);
    }

    const events = await query.limit(limit);

    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    console.error('Get venue events error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch venue events'
    });
  }
});

// Assign venue manager (admin only)
router.put('/:id/assign-manager', verifyToken, requireRole('admin'), validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const { manager_id } = req.body;

    if (!manager_id) {
      return res.status(400).json({
        success: false,
        message: 'Manager ID is required'
      });
    }

    // Verify manager exists and has correct role
    const manager = await db('users')
      .where({ id: manager_id, role: 'venue_manager', is_active: true })
      .whereNull('deleted_at')
      .first();

    if (!manager) {
      return res.status(400).json({
        success: false,
        message: 'Invalid manager. Must be an active venue manager.'
      });
    }

    const [updatedVenue] = await db('venues')
      .where({ id })
      .update({
        manager_id,
        updated_at: new Date()
      })
      .returning(['id', 'name', 'manager_id']);

    if (!updatedVenue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    // Log audit event
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'VENUE_MANAGER_ASSIGNED',
      resource: 'venues',
      resource_id: id,
      new_values: JSON.stringify({ manager_id }),
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Venue manager assigned successfully',
      data: updatedVenue
    });
  } catch (error) {
    console.error('Assign venue manager error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign venue manager'
    });
  }
});

/**
 * GET /api/venues/:venueId/bookings
 * Get all bookings/tickets for a venue
 * Venue managers can only view their own venue's bookings
 */
router.get('/:venueId/bookings', verifyToken, validateUUID, async (req, res) => {
  try {
    const { venueId } = req.params;

    // Verify venue exists
    const venue = await db('venues')
      .where('id', venueId)
      .whereNull('deleted_at')
      .first();

    if (!venue) {
      return res.status(404).json({
        success: false,
        message: 'Venue not found'
      });
    }

    // Verify access: only venue manager of this venue or admin can view
    if (req.user.role === 'venue_manager' && venue.manager_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You do not manage this venue'
      });
    }

    // Fetch all tickets for events at this venue
    const bookings = await db('tickets as t')
      .select(
        't.id',
        't.id as booking_id',
        't.ticket_type',
        't.status',
        't.created_at',
        't.price as total_price',
        't.payment_status',
        db.raw("CONCAT(u.first_name, ' ', u.last_name) as customer_name"),
        'u.email as customer_email',
        'e.name as event_title',
        'e.start_date'
      )
      .join('users as u', 't.user_id', 'u.id')
      .join('events as e', 't.event_id', 'e.id')
      .where('e.venue_id', venueId)
      .whereNull('t.deleted_at')
      .orderBy('t.created_at', 'desc');

    res.json({
      success: true,
      data: bookings
    });
  } catch (error) {
    console.error('Get venue bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
      error: error.message
    });
  }
});

module.exports = router;
