const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireRole, canManageEvent } = require('../middleware/auth');
const { validatePagination, validateUUID, validateEventCreation, validateEventUpdate } = require('../middleware/validation');

// Get all events (public access with filters)
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      category,
      event_type,
      event_mode,
      virtual_event_type,
      venue_id,
      organizer_id,
      status = 'published',
      start_date,
      end_date,
      sort_by = 'start_date',
      sort_order = 'desc'
    } = req.query;

    const offset = (page - 1) * limit;

    let query = db('events')
      .leftJoin('venues', 'events.venue_id', 'venues.id')
      .leftJoin('users as organizers', 'events.organizer_id', 'organizers.id')
      .whereNull('events.deleted_at')
      .select([
        'events.*',
        'venues.name as venue_name',
        'venues.city as venue_city',
        'venues.address as venue_address',
        'organizers.first_name as organizer_first_name',
        'organizers.last_name as organizer_last_name'
      ]);

    // Apply filters
    if (search) {
      query = query.where(function() {
        this.where('events.title', 'ilike', `%${search}%`)
          .orWhere('events.description', 'ilike', `%${search}%`)
          .orWhere('venues.name', 'ilike', `%${search}%`);
      });
    }

    if (category) {
      query = query.where('events.category', category);
    }

    if (event_type) {
      query = query.where('events.event_type', event_type);
    }

    // Filter by event mode (in_person, virtual, hybrid)
    if (event_mode) {
      query = query.where('events.event_mode', event_mode);
    }

    // Filter by virtual event type (workshop, training, conference, etc.)
    if (virtual_event_type) {
      query = query.where('events.virtual_event_type', virtual_event_type);
    }

    if (venue_id) {
      query = query.where('events.venue_id', venue_id);
    }

    if (organizer_id) {
      query = query.where('events.organizer_id', organizer_id);
    }

    if (status) {
      query = query.where('events.status', status);
    }

    if (start_date) {
      query = query.where('events.start_date', '>=', start_date);
    }

    if (end_date) {
      query = query.where('events.end_date', '<=', end_date);
    }

    // Apply sorting
    query = query.orderBy(`events.${sort_by}`, sort_order === 'asc' ? 'asc' : 'desc');

    // Get total count for pagination
    const totalQuery = query.clone().clearSelect().clearOrder().count('* as count').first();
    const [events, total] = await Promise.all([
      query.limit(limit).offset(offset),
      totalQuery
    ]);

    // Debug logging: output number of events and first few event titles
    console.log(`[EVENTS API] Returned ${events.length} events. Example titles:`, events.slice(0, 5).map(e => e.title));

    res.json({
      success: true,
      data: {
        events,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.count),
          pages: Math.ceil(total.count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch events'
    });
  }
});

// Get event by ID (public access)
router.get('/:id', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const event = await db('events')
      .leftJoin('venues', 'events.venue_id', 'venues.id')
      .leftJoin('users as organizers', 'events.organizer_id', 'organizers.id')
      .where('events.id', id)
      .whereNull('events.deleted_at')
      .select([
        'events.*',
        'venues.name as venue_name',
        'venues.city as venue_city',
        'venues.state as venue_state',
        'venues.country as venue_country',
        'venues.address as venue_address',
        'venues.capacity as venue_capacity',
        'venues.facilities as venue_facilities',
        'organizers.first_name as organizer_first_name',
        'organizers.last_name as organizer_last_name',
        'organizers.email as organizer_email'
      ])
      .first();

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Get available tickets count
    const ticketsSold = await db('tickets')
      .where('event_id', id)
      .whereIn('status', ['confirmed', 'used'])
      .count('id as count')
      .first();

    event.available_tickets = event.total_capacity - parseInt(ticketsSold.count);

    res.json({
      success: true,
      data: event
    });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch event'
    });
  }
});

// Create new event (organizer only)
router.post('/', verifyToken, requireRole('organizer', 'admin'), validateEventCreation, async (req, res) => {
  try {
    // Determine organizer_id based on user role
    let organizerId;
    if (req.user.role === 'organizer') {
      organizerId = req.user.id;
    } else if (req.user.role === 'admin') {
      organizerId = req.body.organizer_id;
    }

    // Whitelist of allowed columns in the events table
    const allowedFields = [
      'title', 'description', 'short_description', 'event_type', 'category',
      'venue_id', 'organizer_id', 'start_date', 'end_date', 'base_price',
      'currency', 'total_capacity', 'available_tickets', 'sold_tickets',
      'status', 'event_image_url', 'images', 'tags', 'terms_and_conditions',
      'refund_policy', 'is_featured', 'requires_approval', 'min_age', 
      'has_seating', 'seat_layout', 'pricing_tiers', 'published_at',
      'sales_start_date', 'sales_end_date', 'deleted_at', 'duration_minutes',
      'ticket_template_id',
      // Streaming fields
      'is_streaming_event', 'stream_url', 'stream_key', 'stream_provider',
      'stream_embed_code', 'stream_start_time', 'stream_end_time', 'is_stream_active',
      'stream_viewer_count', 'stream_description', 'streaming_price', 'allow_replay',
      'replay_available_until',
      // Virtual event fields
      'event_mode', 'virtual_event_type', 'meeting_platform', 'meeting_link',
      'meeting_id', 'meeting_password', 'recording_url', 'max_attendees',
      'technical_requirements', 'access_instructions', 'requires_registration',
      'sends_reminder_email', 'reminder_hours_before', 'chat_enabled',
      'screen_share_enabled', 'breakout_rooms_enabled', 'q_and_a_enabled',
      'polling_enabled', 'recording_available_after_event', 'auto_record',
      'allow_virtual_attendees', 'virtual_ticket_price', 'virtual_capacity',
      'host_name', 'host_email', 'host_bio', 'host_image_url',
      'additional_speakers', 'learning_objectives', 'provides_certificate',
      'certificate_template_url', 'certificate_text', 'issuing_organization',
      'average_rating', 'total_reviews', 'completion_percentage', 'metadata'
    ];

    // Filter incoming data to only include allowed fields
    let eventData = Object.keys(req.body)
      .filter(key => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = req.body[key];
        return obj;
      }, {});

    eventData.organizer_id = organizerId;
    eventData.status = eventData.status || 'draft';

    // Validate venue exists and user can manage it (if venue manager)
    if (req.user.role === 'venue_manager') {
      const venue = await db('venues')
        .where({ id: eventData.venue_id, manager_id: req.user.id })
        .first();

      if (!venue) {
        return res.status(403).json({
          success: false,
          message: 'You can only create events at venues you manage'
        });
      }
    }

    // Calculate duration
    const startDate = new Date(eventData.start_date);
    const endDate = new Date(eventData.end_date);
    eventData.duration_minutes = Math.floor((endDate - startDate) / (1000 * 60));

    // Set available tickets to total capacity initially
    eventData.available_tickets = eventData.total_capacity;

    // Handle ticket quantities - if provided, validate and store; otherwise use defaults
    if (eventData.ticket_quantities && typeof eventData.ticket_quantities === 'object') {
      // Ensure all quantities are non-negative integers
      Object.keys(eventData.ticket_quantities).forEach(type => {
        const qty = parseInt(eventData.ticket_quantities[type]);
        eventData.ticket_quantities[type] = isNaN(qty) || qty < 0 ? 0 : qty;
      });
    } else {
      // Set default quantities if not provided
      eventData.ticket_quantities = {
        standard: 100,
        vip: 50,
        premium: 30,
        economy: 0,
        business: 0,
        first_class: 0
      };
    }

    const [event] = await db('events')
      .insert(eventData)
      .returning('*');

    // Log audit event
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'EVENT_CREATED',
      resource: 'events',
      resource_id: event.id,
      new_values: JSON.stringify(event),
      timestamp: new Date()
    });

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      data: event
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create event'
    });
  }
});

// Update event (organizer or venue manager)
router.put('/:id', verifyToken, canManageEvent, validateUUID, validateEventUpdate, async (req, res) => {
  try {
    const { id } = req.params;
    let updateData = req.body;

    // Whitelist of allowed fields to update
    const allowedFields = [
      'title', 'description', 'event_type', 'start_date', 'end_date', 
      'venue_id', 'base_price', 'total_capacity', 'is_private', 'status',
      'event_image_url', 'is_promotional', 'featured', 'streaming_enabled',
      'streaming_url', 'available_ticket_types', 'duration_minutes',
      'user_id', 'organizer_id', 'venue_name', 'category', 'subcategory',
      'tags', 'seo_title', 'seo_description', 'seo_keywords', 'slug',
      'ticket_template_id',
      // Virtual event fields
      'event_mode', 'virtual_event_type', 'meeting_platform', 'meeting_link',
      'meeting_id', 'meeting_password', 'recording_url', 'max_attendees',
      'technical_requirements', 'access_instructions', 'requires_registration',
      'sends_reminder_email', 'reminder_hours_before', 'chat_enabled',
      'screen_share_enabled', 'breakout_rooms_enabled', 'q_and_a_enabled',
      'polling_enabled', 'recording_available_after_event', 'auto_record',
      'allow_virtual_attendees', 'virtual_ticket_price', 'virtual_capacity',
      'host_name', 'host_email', 'host_bio', 'host_image_url',
      'additional_speakers', 'learning_objectives', 'provides_certificate',
      'certificate_template_url', 'certificate_text', 'issuing_organization'
    ];

    // Filter updateData to only include allowed fields
    updateData = Object.keys(updateData)
      .filter(key => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = updateData[key];
        return obj;
      }, {});

    // If no valid fields to update, return error
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    // Remove fields that shouldn't be updated directly
    delete updateData.id;
    delete updateData.created_at;
    delete updateData.deleted_at;

    updateData.updated_at = new Date();

    // Recalculate duration if dates changed
    if (updateData.start_date || updateData.end_date) {
      const event = await db('events').where({ id }).first();
      const startDate = new Date(updateData.start_date || event.start_date);
      const endDate = new Date(updateData.end_date || event.end_date);
      updateData.duration_minutes = Math.floor((endDate - startDate) / (1000 * 60));
    }

    const [updatedEvent] = await db('events')
      .where({ id })
      .update(updateData)
      .returning('*');

    if (!updatedEvent) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Log audit event
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'EVENT_UPDATED',
      resource: 'events',
      resource_id: id,
      old_values: null, // Could implement old values tracking
      new_values: JSON.stringify(updateData),
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Event updated successfully',
      data: updatedEvent
    });
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update event'
    });
  }
});

// Soft delete event (organizer or admin)
router.delete('/:id', verifyToken, canManageEvent, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if event exists and is not already deleted
    const event = await db('events').where('id', id).whereNull('deleted_at').first();
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    const [deletedEvent] = await db('events')
      .where({ id })
      .update({
        deleted_at: new Date(),
        status: 'cancelled'
      })
      .returning(['id', 'title']);

    if (!deletedEvent) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Log audit event
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'EVENT_DELETED',
      resource: 'events',
      resource_id: id,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Event deleted successfully'
    });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete event'
    });
  }
});

// Get event statistics (organizer only)
router.get('/:id/stats', verifyToken, canManageEvent, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const stats = await db('tickets')
      .where('event_id', id)
      .select(
        db.raw('COUNT(*) as total_tickets'),
        db.raw('COUNT(CASE WHEN status = \'confirmed\' THEN 1 END) as confirmed_tickets'),
        db.raw('COUNT(CASE WHEN status = \'used\' THEN 1 END) as used_tickets'),
        db.raw('COUNT(CASE WHEN status = \'cancelled\' THEN 1 END) as cancelled_tickets'),
        db.raw('SUM(CASE WHEN status IN (\'confirmed\', \'used\') THEN total_amount ELSE 0 END) as total_revenue'),
        db.raw('AVG(CASE WHEN status IN (\'confirmed\', \'used\') THEN total_amount ELSE NULL END) as average_ticket_price')
      )
      .first();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get event stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch event statistics'
    });
  }
});

// Get event tickets (organizer only)
router.get('/:id/tickets', verifyToken, canManageEvent, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, status } = req.query;

    const offset = (page - 1) * limit;

    let query = db('tickets')
      .join('users', 'tickets.user_id', 'users.id')
      .where('tickets.event_id', id)
      .whereNull('tickets.deleted_at')
      .select([
        'tickets.*',
        'users.first_name',
        'users.last_name',
        'users.email'
      ])
      .orderBy('tickets.created_at', 'desc');

    if (status) {
      query = query.where('tickets.status', status);
    }

    // Get total count
    const totalQuery = query.clone().clearSelect().clearOrder().count('* as count').first();
    const [tickets, total] = await Promise.all([
      query.limit(limit).offset(offset),
      totalQuery
    ]);

    res.json({
      success: true,
      data: {
        tickets,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.count),
          pages: Math.ceil(total.count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get event tickets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch event tickets'
    });
  }
});

// GET ticket templates for an event
router.get('/:id/ticket-templates', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const templates = await db('event_ticket_templates')
      .leftJoin('ticket_templates', 'event_ticket_templates.template_id', 'ticket_templates.id')
      .where('event_ticket_templates.event_id', id)
      .whereNull('event_ticket_templates.deleted_at')
      .select([
        'event_ticket_templates.id',
        'event_ticket_templates.event_id',
        'event_ticket_templates.template_id',
        'event_ticket_templates.quantity',
        'event_ticket_templates.override_price',
        'event_ticket_templates.seat_section',
        'event_ticket_templates.position',
        'ticket_templates.name',
        'ticket_templates.description',
        'ticket_templates.ticket_type',
        'ticket_templates.ticket_format',
        'ticket_templates.digital_format',
        'ticket_templates.base_price',
        'ticket_templates.currency',
        'ticket_templates.service_fee',
        'ticket_templates.is_transferable',
        'ticket_templates.is_refundable',
        'ticket_templates.validity_days'
      ])
      .orderBy('event_ticket_templates.position', 'asc');

    res.json({ success: true, data: templates });
  } catch (err) {
    console.error('Get event ticket templates error:', err);
    res.status(500).json({ error: 'Failed to fetch event ticket templates' });
  }
});

// ADD ticket template to event
router.post('/:id/ticket-templates', verifyToken, canManageEvent, async (req, res) => {
  try {
    const { id: eventId } = req.params;
    const { template_id, quantity, override_price, seat_section, position } = req.body;

    if (!template_id || !quantity) {
      return res.status(400).json({ error: 'Template ID and quantity are required' });
    }

    // Verify template exists and belongs to organizer
    const template = await db('ticket_templates')
      .where('id', template_id)
      .where('organizer_id', req.user.id)
      .whereNull('deleted_at')
      .first();

    if (!template) {
      return res.status(404).json({ error: 'Ticket template not found or not authorized' });
    }

    // Check if association already exists
    const existing = await db('event_ticket_templates')
      .where('event_id', eventId)
      .where('template_id', template_id)
      .whereNull('deleted_at')
      .first();

    if (existing) {
      return res.status(400).json({ error: 'This template is already added to this event' });
    }

    const association = {
      event_id: eventId,
      template_id,
      quantity: parseInt(quantity),
      override_price: override_price ? parseFloat(override_price) : null,
      seat_section,
      position: position || 0
    };

    const [insertedId] = await db('event_ticket_templates').insert(association);
    const created = await db('event_ticket_templates')
      .leftJoin('ticket_templates', 'event_ticket_templates.template_id', 'ticket_templates.id')
      .where('event_ticket_templates.id', insertedId)
      .first();

    res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error('Add event ticket template error:', err);
    res.status(500).json({ error: 'Failed to add ticket template to event' });
  }
});

// UPDATE event ticket template association
router.put('/:id/ticket-templates/:templateId', verifyToken, canManageEvent, async (req, res) => {
  try {
    const { id: eventId, templateId } = req.params;
    const { quantity, override_price, seat_section, position } = req.body;

    const association = await db('event_ticket_templates')
      .where('event_id', eventId)
      .where('template_id', templateId)
      .whereNull('deleted_at')
      .first();

    if (!association) {
      return res.status(404).json({ error: 'Template association not found' });
    }

    const updates = {
      ...(quantity && { quantity: parseInt(quantity) }),
      ...(override_price !== undefined && { override_price: override_price ? parseFloat(override_price) : null }),
      ...(seat_section !== undefined && { seat_section }),
      ...(position !== undefined && { position }),
      updated_at: new Date()
    };

    await db('event_ticket_templates').where('id', association.id).update(updates);
    const updated = await db('event_ticket_templates')
      .leftJoin('ticket_templates', 'event_ticket_templates.template_id', 'ticket_templates.id')
      .where('event_ticket_templates.id', association.id)
      .first();

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Update event ticket template error:', err);
    res.status(500).json({ error: 'Failed to update ticket template association' });
  }
});

// DELETE ticket template from event
router.delete('/:id/ticket-templates/:templateId', verifyToken, canManageEvent, async (req, res) => {
  try {
    const { id: eventId, templateId } = req.params;

    const association = await db('event_ticket_templates')
      .where('event_id', eventId)
      .where('template_id', templateId)
      .first();

    if (!association) {
      return res.status(404).json({ error: 'Template association not found' });
    }

    await db('event_ticket_templates').where('id', association.id).update({ deleted_at: new Date() });

    res.json({ success: true, message: 'Template removed from event' });
  } catch (err) {
    console.error('Delete event ticket template error:', err);
    res.status(500).json({ error: 'Failed to remove ticket template from event' });
  }
});

module.exports = router;
