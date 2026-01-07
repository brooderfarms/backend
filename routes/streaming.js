const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const { validateUUID } = require('../middleware/validation');

// Get streaming access for a ticket
router.get('/access/:ticketId', verifyToken, validateUUID, async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await db('tickets')
      .join('events', 'tickets.event_id', 'events.id')
      .where('tickets.id', ticketId)
      .where('tickets.user_id', req.user.id)
      .where('tickets.has_streaming_access', true)
      .whereNull('tickets.deleted_at')
      .select([
        'tickets.*',
        'events.title',
        'events.stream_url',
        'events.stream_provider',
        'events.stream_embed_code',
        'events.is_stream_active',
        'events.stream_start_time',
        'events.stream_end_time',
        'events.allow_replay',
        'events.replay_available_until'
      ])
      .first();

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Streaming access not found or ticket does not include streaming'
      });
    }

    // Check if streaming access is still valid
    const now = new Date();
    if (ticket.stream_access_expires_at && new Date(ticket.stream_access_expires_at) < now) {
      return res.status(403).json({
        success: false,
        message: 'Streaming access has expired'
      });
    }

    // Update last access time and view count
    await db('tickets')
      .where({ id: ticketId })
      .update({
        last_stream_access: now,
        stream_views_count: ticket.stream_views_count + 1
      });

    // Log streaming access
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'STREAM_ACCESSED',
      resource: 'tickets',
      resource_id: ticketId,
      metadata: JSON.stringify({
        event_title: ticket.title,
        stream_provider: ticket.stream_provider
      }),
      timestamp: now
    });

    res.json({
      success: true,
      data: {
        ticket_id: ticket.id,
        event_title: ticket.title,
        stream_url: ticket.stream_url,
        stream_provider: ticket.stream_provider,
        stream_embed_code: ticket.stream_embed_code,
        is_stream_active: ticket.is_stream_active,
        stream_start_time: ticket.stream_start_time,
        stream_end_time: ticket.stream_end_time,
        allow_replay: ticket.allow_replay,
        replay_available_until: ticket.replay_available_until,
        access_token: ticket.stream_access_token,
        views_count: ticket.stream_views_count + 1
      }
    });
  } catch (error) {
    console.error('Get streaming access error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get streaming access'
    });
  }
});

// Get streaming events (public)
router.get('/events', async (req, res) => {
  try {
    const { page = 1, limit = 10, status = 'published' } = req.query;
    const offset = (page - 1) * limit;

    const events = await db('events')
      .where('is_streaming_event', true)
      .where('status', status)
      .whereNull('deleted_at')
      .select([
        'id',
        'title',
        'description',
        'short_description',
        'event_type',
        'category',
        'start_date',
        'end_date',
        'stream_provider',
        'streaming_price',
        'is_stream_active',
        'allow_replay'
      ])
      .orderBy('start_date', 'asc')
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    console.error('Get streaming events error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get streaming events'
    });
  }
});

// Update stream status (organizer only)
router.put('/status/:eventId', verifyToken, validateUUID, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { is_active, viewer_count } = req.body;

    // Check if user owns the event
    const event = await db('events')
      .where({ id: eventId, organizer_id: req.user.id })
      .whereNull('deleted_at')
      .first();

    if (!event) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this stream'
      });
    }

    const updateData = {
      updated_at: new Date()
    };

    if (is_active !== undefined) {
      updateData.is_stream_active = is_active;
      updateData.stream_start_time = is_active ? new Date() : updateData.stream_start_time;
    }

    if (viewer_count !== undefined) {
      updateData.stream_viewer_count = viewer_count;
    }

    await db('events')
      .where({ id: eventId })
      .update(updateData);

    // Notify all ticket holders about stream status change
    if (is_active !== undefined) {
      await db('audit_logs').insert({
        user_id: req.user.id,
        action: is_active ? 'STREAM_STARTED' : 'STREAM_ENDED',
        resource: 'events',
        resource_id: eventId,
        metadata: JSON.stringify({
          event_title: event.title,
          viewer_count: viewer_count || 0
        }),
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Stream status updated successfully'
    });
  } catch (error) {
    console.error('Update stream status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update stream status'
    });
  }
});

// Get stream analytics (organizer only)
router.get('/analytics/:eventId', verifyToken, validateUUID, async (req, res) => {
  try {
    const { eventId } = req.params;

    // Check if user owns the event
    const event = await db('events')
      .where({ id: eventId, organizer_id: req.user.id })
      .whereNull('deleted_at')
      .first();

    if (!event) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this analytics'
      });
    }

    // Get streaming analytics
    const analytics = await db('tickets')
      .where('event_id', eventId)
      .where('has_streaming_access', true)
      .select(
        db.raw('COUNT(*) as total_streaming_tickets'),
        db.raw('SUM(stream_views_count) as total_views'),
        db.raw('AVG(stream_views_count) as avg_views_per_ticket'),
        db.raw('COUNT(CASE WHEN last_stream_access IS NOT NULL THEN 1 END) as tickets_with_views')
      )
      .first();

    // Get view distribution over time
    const viewHistory = await db('audit_logs')
      .where('resource', 'tickets')
      .where('action', 'STREAM_ACCESSED')
      .whereRaw("metadata->>'event_title' = ?", [event.title])
      .select(
        db.raw("DATE_TRUNC('hour', timestamp) as hour"),
        db.raw('COUNT(*) as views')
      )
      .groupByRaw("DATE_TRUNC('hour', timestamp)")
      .orderBy('hour', 'asc')
      .limit(24); // Last 24 hours

    res.json({
      success: true,
      data: {
        event: {
          id: event.id,
          title: event.title,
          is_stream_active: event.is_stream_active,
          stream_viewer_count: event.stream_viewer_count
        },
        analytics: {
          ...analytics,
          view_history: viewHistory
        }
      }
    });
  } catch (error) {
    console.error('Get stream analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get stream analytics'
    });
  }
});

// Validate streaming access token
router.post('/validate-access', async (req, res) => {
  try {
    const { ticket_id, access_token } = req.body;

    if (!ticket_id || !access_token) {
      return res.status(400).json({
        success: false,
        message: 'Ticket ID and access token are required'
      });
    }

    const ticket = await db('tickets')
      .join('events', 'tickets.event_id', 'events.id')
      .where('tickets.id', ticket_id)
      .where('tickets.stream_access_token', access_token)
      .where('tickets.has_streaming_access', true)
      .whereNull('tickets.deleted_at')
      .select([
        'tickets.*',
        'events.title',
        'events.is_stream_active',
        'events.stream_end_time',
        'events.allow_replay',
        'events.replay_available_until'
      ])
      .first();

    if (!ticket) {
      return res.status(403).json({
        success: false,
        message: 'Invalid streaming access'
      });
    }

    // Check if access is still valid
    const now = new Date();
    const endTime = ticket.stream_end_time || ticket.valid_until;

    if (ticket.allow_replay && ticket.replay_available_until) {
      if (now > new Date(ticket.replay_available_until)) {
        return res.status(403).json({
          success: false,
          message: 'Streaming access has expired'
        });
      }
    } else if (now > new Date(endTime)) {
      return res.status(403).json({
        success: false,
        message: 'Streaming access has expired'
      });
    }

    res.json({
      success: true,
      data: {
        ticket_id: ticket.id,
        event_title: ticket.title,
        is_stream_active: ticket.is_stream_active,
        access_valid: true
      }
    });
  } catch (error) {
    console.error('Validate streaming access error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate streaming access'
    });
  }
});

module.exports = router;
