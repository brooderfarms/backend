const express = require('express');
const knex = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const approvalPaymentService = require('../services/approvalPaymentService');

const router = express.Router();

// GET all seasonal tickets (public)
router.get('/', async (req, res) => {
  try {
    const { status = 'published', season_year, limit = 12, page = 1, eventId, include_drafts } = req.query;
    const offset = (page - 1) * limit;

    // Build count query separately to avoid GROUP BY issues
    let countQuery = knex('seasonal_tickets');
    let dataQuery = knex('seasonal_tickets')
      .select(
        'seasonal_tickets.*',
        knex.raw('users.first_name || \' \' || users.last_name as organizer_name')
      )
      .leftJoin('users', 'seasonal_tickets.organizer_id', 'users.id');

    // Apply status filter based on include_drafts parameter
    if (include_drafts === 'true') {
      // Include all statuses (drafts and published)
      // Don't filter by status
    } else {
      // Only show published passes (default behavior for public browsing)
      const filterStatus = status || 'published';
      if (filterStatus !== 'all') {
        countQuery = countQuery.where('seasonal_tickets.status', filterStatus);
        dataQuery = dataQuery.where('seasonal_tickets.status', filterStatus);
      }
    }

    if (season_year) {
      countQuery = countQuery.where('seasonal_tickets.season_year', season_year);
      dataQuery = dataQuery.where('seasonal_tickets.season_year', season_year);
    }

    // If eventId is provided, only get seasonal tickets that include this event
    if (eventId) {
      countQuery = countQuery
        .distinct('seasonal_tickets.id')
        .join('seasonal_ticket_events', 'seasonal_tickets.id', 'seasonal_ticket_events.seasonal_ticket_id')
        .where('seasonal_ticket_events.event_id', eventId);
      
      dataQuery = dataQuery
        .distinct('seasonal_tickets.id')
        .join('seasonal_ticket_events', 'seasonal_tickets.id', 'seasonal_ticket_events.seasonal_ticket_id')
        .where('seasonal_ticket_events.event_id', eventId);
    }

    // Get total count
    const countResult = await countQuery.count('* as count').first();
    const total = countResult?.count || 0;

    // Get data with pagination
    const seasonalTickets = await dataQuery
      .limit(limit)
      .offset(offset)
      .orderBy('seasonal_tickets.start_date', 'desc');

    // Get event count for each ticket
    const ticketsWithEventCount = await Promise.all(
      seasonalTickets.map(async (ticket) => {
        const eventCount = await knex('seasonal_ticket_events')
          .where('seasonal_ticket_id', ticket.id)
          .count('* as count')
          .first();
        return {
          ...ticket,
          event_count: eventCount?.count || 0,
        };
      })
    );

    res.json({
      success: true,
      data: ticketsWithEventCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Get seasonal tickets error:', err);
    res.status(500).json({ error: 'Failed to fetch seasonal tickets' });
  }
});

// GET user's purchased season passes
router.get('/user/my-season-passes', verifyToken, async (req, res) => {
  try {
    const { id: userId } = req.user;

    const purchases = await knex('seasonal_ticket_purchases')
      .where('seasonal_ticket_purchases.user_id', userId)
      .where('seasonal_ticket_purchases.status', 'completed')
      .join('seasonal_tickets', 'seasonal_ticket_purchases.seasonal_ticket_id', 'seasonal_tickets.id')
      .select('seasonal_tickets.*', 'seasonal_ticket_purchases.id as purchase_id', 'seasonal_ticket_purchases.price_paid', 'seasonal_ticket_purchases.reference_code', 'seasonal_ticket_purchases.created_at')
      .orderBy('seasonal_ticket_purchases.created_at', 'desc');

    res.json({
      success: true,
      data: purchases,
    });
  } catch (err) {
    console.error('Get user season passes error:', err);
    res.status(500).json({ error: 'Failed to fetch season passes' });
  }
});

// GET single seasonal ticket with events
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const seasonalTicket = await knex('seasonal_tickets')
      .leftJoin('users', 'seasonal_tickets.organizer_id', 'users.id')
      .select(
        'seasonal_tickets.*',
        knex.raw('users.first_name || \' \' || users.last_name as organizer_name')
      )
      .where('seasonal_tickets.id', id)
      .first();

    if (!seasonalTicket) {
      return res.status(404).json({ error: 'Seasonal ticket not found' });
    }

    // Get associated events
    const events = await knex('seasonal_ticket_events')
      .where('seasonal_ticket_id', id)
      .join('events', 'seasonal_ticket_events.event_id', 'events.id')
      .select('events.*');

    seasonalTicket.events = events;

    res.json({
      success: true,
      data: seasonalTicket,
    });
  } catch (err) {
    console.error('Get seasonal ticket error:', err);
    res.status(500).json({ error: 'Failed to fetch seasonal ticket' });
  }
});

// CREATE seasonal ticket (organizer/admin only)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { id: userId, role } = req.user;

    if (!['organizer', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Only organizers and admins can create seasonal tickets' });
    }

    const {
      name,
      description,
      season_year,
      season_type,
      start_date,
      end_date,
      base_price,
      season_price,
      discount_percentage,
      available_quantity,
      image_url,
      status = 'draft',
    } = req.body;

    if (!name || !season_year || !start_date || !end_date || !base_price || !season_price || !available_quantity) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const organizer_id = role === 'admin' ? userId : userId;

    const [seasonalTicket] = await knex('seasonal_tickets')
      .insert({
        organizer_id,
        name,
        description,
        season_year,
        season_type,
        start_date,
        end_date,
        base_price,
        season_price,
        discount_percentage,
        available_quantity,
        image_url,
        status,
      })
      .returning('*');

    res.status(201).json({
      success: true,
      data: seasonalTicket,
    });
  } catch (err) {
    console.error('Create seasonal ticket error:', err);
    res.status(500).json({ error: 'Failed to create seasonal ticket' });
  }
});

// UPDATE seasonal ticket
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const { id } = req.params;

    // Check permission
    const seasonalTicket = await knex('seasonal_tickets').where('id', id).first();
    if (!seasonalTicket) {
      return res.status(404).json({ error: 'Seasonal ticket not found' });
    }

    if (role !== 'admin' && seasonalTicket.organizer_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to update this seasonal ticket' });
    }

    const updateData = req.body;
    const [updated] = await knex('seasonal_tickets')
      .where('id', id)
      .update(updateData)
      .returning('*');

    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    console.error('Update seasonal ticket error:', err);
    res.status(500).json({ error: 'Failed to update seasonal ticket' });
  }
});

// DELETE seasonal ticket
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const { id } = req.params;

    const seasonalTicket = await knex('seasonal_tickets').where('id', id).first();
    if (!seasonalTicket) {
      return res.status(404).json({ error: 'Seasonal ticket not found' });
    }

    if (role !== 'admin' && seasonalTicket.organizer_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this seasonal ticket' });
    }

    await knex('seasonal_tickets').where('id', id).update({
      deleted_at: new Date()
    });

    res.json({
      success: true,
      message: 'Seasonal ticket deleted',
    });
  } catch (err) {
    console.error('Delete seasonal ticket error:', err);
    res.status(500).json({ error: 'Failed to delete seasonal ticket' });
  }
});

// ADD event to seasonal ticket
router.post('/:id/events', verifyToken, async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const { id } = req.params;
    const { event_id } = req.body;

    const seasonalTicket = await knex('seasonal_tickets').where('id', id).first();
    if (!seasonalTicket) {
      return res.status(404).json({ error: 'Seasonal ticket not found' });
    }

    if (role !== 'admin' && seasonalTicket.organizer_id !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Check if event exists
    const event = await knex('events').where('id', event_id).first();
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if already exists
    const exists = await knex('seasonal_ticket_events')
      .where({ seasonal_ticket_id: id, event_id })
      .first();

    if (exists) {
      return res.status(400).json({ error: 'Event already in this seasonal ticket' });
    }

    await knex('seasonal_ticket_events').insert({
      seasonal_ticket_id: id,
      event_id,
    });

    // Update total_events count
    const eventCount = await knex('seasonal_ticket_events')
      .where('seasonal_ticket_id', id)
      .count('* as count')
      .first();

    await knex('seasonal_tickets')
      .where('id', id)
      .update({ total_events: eventCount.count });

    res.status(201).json({
      success: true,
      message: 'Event added to seasonal ticket',
    });
  } catch (err) {
    console.error('Add event to seasonal ticket error:', err);
    res.status(500).json({ error: 'Failed to add event' });
  }
});

// REMOVE event from seasonal ticket
router.delete('/:id/events/:eventId', verifyToken, async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const { id, eventId } = req.params;

    const seasonalTicket = await knex('seasonal_tickets').where('id', id).first();
    if (!seasonalTicket) {
      return res.status(404).json({ error: 'Seasonal ticket not found' });
    }

    if (role !== 'admin' && seasonalTicket.organizer_id !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await knex('seasonal_ticket_events')
      .where({ seasonal_ticket_id: id, event_id: eventId })
      .update({
        deleted_at: new Date()
      });

    // Update total_events count
    const eventCount = await knex('seasonal_ticket_events')
      .where('seasonal_ticket_id', id)
      .count('* as count')
      .first();

    await knex('seasonal_tickets')
      .where('id', id)
      .update({ total_events: eventCount.count });

    res.json({
      success: true,
      message: 'Event removed from seasonal ticket',
    });
  } catch (err) {
    console.error('Remove event from seasonal ticket error:', err);
    res.status(500).json({ error: 'Failed to remove event' });
  }
});

// PURCHASE seasonal ticket
router.post('/:id/purchase', verifyToken, async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { id } = req.params;
    const { payment_id } = req.body;

    const seasonalTicket = await knex('seasonal_tickets').where('id', id).first();
    if (!seasonalTicket) {
      return res.status(404).json({ error: 'Seasonal ticket not found' });
    }

    // Check availability
    if (seasonalTicket.sold_quantity >= seasonalTicket.available_quantity) {
      return res.status(400).json({ error: 'This seasonal ticket is sold out' });
    }

    // Check if user already owns this season pass
    const existing = await knex('seasonal_ticket_purchases')
      .where({ seasonal_ticket_id: id, user_id: userId, status: 'completed' })
      .first();

    if (existing) {
      return res.status(400).json({ error: 'You already own this seasonal ticket' });
    }

    const reference_code = `ST-${id.substring(0, 8)}-${userId.substring(0, 8)}-${Date.now()}`.toUpperCase();

    const [purchase] = await knex('seasonal_ticket_purchases')
      .insert({
        seasonal_ticket_id: id,
        user_id: userId,
        price_paid: seasonalTicket.season_price,
        payment_id,
        status: 'completed',
        reference_code,
      })
      .returning('*');

    // Update sold quantity
    await knex('seasonal_tickets')
      .where('id', id)
      .increment('sold_quantity', 1);

    // Record earnings for organizer
    try {
      if (seasonalTicket.organizer_id) {
        await approvalPaymentService.addEarnings(
          seasonalTicket.organizer_id,
          seasonalTicket.season_price,
          'season_pass_sale'
        );
      }
    } catch (earnError) {
      console.error('Error recording earnings for seasonal ticket:', earnError);
      // Don't fail the purchase if earnings recording fails
    }

    res.status(201).json({
      success: true,
      data: purchase,
    });
  } catch (err) {
    console.error('Purchase seasonal ticket error:', err);
    res.status(500).json({ error: 'Failed to purchase seasonal ticket' });
  }
});

module.exports = router;
