/**
 * Soft-delete recovery endpoints for retrieving deleted items
 * Add this to each route file (events, venues, tickets, users, etc.)
 */

// Example for events.js:

const express = require('express');
const db = require('../config/database');
const { verifyToken, requireRole } = require('../middleware/auth');

// GET deleted events (admin only)
router.get('/deleted', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { limit = 20, offset = 0, search } = req.query;

    let query = db('events')
      .whereNotNull('deleted_at')
      .select('*');

    if (search) {
      query = query.where('title', 'like', `%${search}%`);
    }

    const items = await query
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    const totalQuery = db('events').whereNotNull('deleted_at');
    if (search) {
      totalQuery.where('title', 'like', `%${search}%`);
    }
    const total = await totalQuery.count('* as count').first();

    res.json({
      success: true,
      data: items,
      total: total?.count || 0
    });
  } catch (error) {
    console.error('Get deleted items error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Restore deleted event
router.post('/:id/restore', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const event = await db('events').where('id', req.params.id).first();

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    if (!event.deleted_at) {
      return res.status(400).json({ success: false, message: 'Event is not deleted' });
    }

    await db('events')
      .where('id', req.params.id)
      .update({ deleted_at: null, updated_at: new Date() });

    res.json({ success: true, message: 'Event restored successfully' });
  } catch (error) {
    console.error('Restore error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Permanently delete event (hard delete)
router.delete('/:id/permanent-delete', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const event = await db('events').where('id', req.params.id).first();

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    // Optionally check if soft-deleted
    if (!event.deleted_at) {
      return res.status(400).json({ success: false, message: 'Can only permanently delete soft-deleted items' });
    }

    // Delete associated records first (cascade-like behavior)
    await db('tickets').where('event_id', req.params.id).delete();
    await db('event_ticket_templates').where('event_id', req.params.id).delete();
    
    // Then delete the event
    await db('events').where('id', req.params.id).delete();

    res.json({ success: true, message: 'Event permanently deleted' });
  } catch (error) {
    console.error('Permanent delete error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
