const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { validateUUID } = require('../middleware/validation');
const sessionService = require('../services/sessionService');
const db = require('../config/database');

/**
 * Create session for event
 * POST /api/events/:eventId/sessions
 */
router.post('/:eventId/sessions', verifyToken, validateUUID, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { session_name, session_description, start_time, end_time, capacity, base_price } = req.body;

    // Verify user can manage this event
    const event = await db('events')
      .where({ id: eventId })
      .whereNull('deleted_at')
      .first();

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    if (event.user_id !== req.user.id && event.organizer_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage this event'
      });
    }

    // Validate input
    if (!session_name || !start_time || !end_time || !capacity) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    if (new Date(end_time) <= new Date(start_time)) {
      return res.status(400).json({
        success: false,
        message: 'End time must be after start time'
      });
    }

    const session = await sessionService.createSession(eventId, {
      session_name,
      session_description,
      start_time,
      end_time,
      capacity,
      base_price: base_price || event.base_price
    });

    res.status(201).json({
      success: true,
      message: 'Session created successfully',
      data: session
    });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create session'
    });
  }
});

/**
 * Get sessions for event
 * GET /api/events/:eventId/sessions
 */
router.get('/:eventId/sessions', validateUUID, async (req, res) => {
  try {
    const { eventId } = req.params;

    const sessions = await sessionService.getEventSessions(eventId);

    res.json({
      success: true,
      data: sessions
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sessions'
    });
  }
});

/**
 * Get session details
 * GET /api/sessions/:sessionId
 */
router.get('/:sessionId/details', validateUUID, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const stats = await sessionService.getSessionStats(sessionId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get session details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch session details'
    });
  }
});

/**
 * Update session
 * PUT /api/sessions/:sessionId
 */
router.put('/:sessionId', verifyToken, validateUUID, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const updateData = req.body;

    // Get session with event to verify permission
    const session = await db('event_sessions')
      .where({ id: sessionId })
      .first();

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    const event = await db('events')
      .where({ id: session.event_id })
      .first();

    if (event.user_id !== req.user.id && event.organizer_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this session'
      });
    }

    const updatedSession = await sessionService.updateSession(sessionId, updateData);

    res.json({
      success: true,
      message: 'Session updated successfully',
      data: updatedSession
    });
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update session'
    });
  }
});

/**
 * Delete session
 * DELETE /api/sessions/:sessionId
 */
router.delete('/:sessionId', verifyToken, validateUUID, async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get session with event to verify permission
    const session = await db('event_sessions')
      .where({ id: sessionId })
      .first();

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    const event = await db('events')
      .where({ id: session.event_id })
      .first();

    if (event.user_id !== req.user.id && event.organizer_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this session'
      });
    }

    await sessionService.deleteSession(sessionId);

    res.json({
      success: true,
      message: 'Session deleted successfully'
    });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete session'
    });
  }
});

module.exports = router;
