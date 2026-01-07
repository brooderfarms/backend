const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { verifyToken } = require('../middleware/auth');
const ticketTransferService = require('../services/ticketTransferService');
const auditService = require('../services/auditService');
const db = require('../config/database');

/**
 * POST /api/tickets/transfer/initiate
 * Initiate a ticket transfer
 * @body {number} ticketId - Ticket to transfer
 * @body {number} toUserId - Recipient user ID (optional if toEmail provided)
 * @body {string} toEmail - Recipient email (optional if toUserId provided)
 */
router.post('/transfer/initiate', verifyToken, async (req, res) => {
  try {
    const schema = Joi.object({
      ticketId: Joi.number().required(),
      toUserId: Joi.number().optional(),
      toEmail: Joi.string().email().optional()
    }).or('toUserId', 'toEmail');

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    if (!value.toUserId && !value.toEmail) {
      return res.status(400).json({ error: 'Either toUserId or toEmail is required' });
    }

    const result = await ticketTransferService.initiateTransfer(
      value.ticketId,
      req.user.id,
      value.toUserId || null,
      value.toEmail || null
    );

    await auditService.logAction({
      userId: req.user.id,
      action: 'INITIATE_TICKET_TRANSFER',
      resourceType: 'ticket_transfer',
      resourceId: result.transferId,
      changes: {
        ticketId: value.ticketId,
        toUserId: value.toUserId,
        toEmail: value.toEmail
      }
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error initiating transfer:', error);
    
    if (error.message.includes('not found') || error.message.includes('does not belong')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('Cannot transfer')) {
      return res.status(409).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tickets/transfer/:transferId/accept
 * Accept a pending ticket transfer
 * @param {number} transferId - Transfer request ID
 */
router.post('/transfer/:transferId/accept', verifyToken, async (req, res) => {
  try {
    const { transferId } = req.params;

    if (isNaN(transferId)) {
      return res.status(400).json({ error: 'Invalid transfer ID' });
    }

    const result = await ticketTransferService.acceptTransfer(
      parseInt(transferId),
      req.user.id
    );

    await auditService.logAction({
      userId: req.user.id,
      action: 'ACCEPT_TICKET_TRANSFER',
      resourceType: 'ticket_transfer',
      resourceId: parseInt(transferId),
      changes: { ticketId: result.ticketId }
    });

    res.json(result);
  } catch (error) {
    console.error('Error accepting transfer:', error);
    
    if (error.message.includes('not found') || error.message.includes('no longer available')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('not intended') || error.message.includes('expired')) {
      return res.status(403).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tickets/transfer/:transferId/decline
 * Decline a pending ticket transfer
 * @param {number} transferId - Transfer request ID
 */
router.post('/transfer/:transferId/decline', verifyToken, async (req, res) => {
  try {
    const { transferId } = req.params;

    if (isNaN(transferId)) {
      return res.status(400).json({ error: 'Invalid transfer ID' });
    }

    const result = await ticketTransferService.declineTransfer(
      parseInt(transferId),
      req.user.id
    );

    await auditService.logAction({
      userId: req.user.id,
      action: 'DECLINE_TICKET_TRANSFER',
      resourceType: 'ticket_transfer',
      resourceId: parseInt(transferId)
    });

    res.json(result);
  } catch (error) {
    console.error('Error declining transfer:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('Unauthorized')) {
      return res.status(403).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tickets/:ticketId/refund
 * Request a refund for a ticket
 * @param {number} ticketId - Ticket ID
 * @body {string} reason - Refund reason
 * @body {number} refundAmount - Amount to refund (optional, defaults to full)
 */
router.post('/:ticketId/refund', verifyToken, async (req, res) => {
  try {
    const schema = Joi.object({
      reason: Joi.string().required().min(10).max(500),
      refundAmount: Joi.number().optional().positive()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { ticketId } = req.params;

    if (isNaN(ticketId)) {
      return res.status(400).json({ error: 'Invalid ticket ID' });
    }

    const result = await ticketTransferService.processRefund(
      parseInt(ticketId),
      req.user.id,
      value.reason,
      value.refundAmount || null
    );

    await auditService.logAction({
      userId: req.user.id,
      action: 'REQUEST_TICKET_REFUND',
      resourceType: 'ticket_refund',
      resourceId: result.refundId,
      changes: {
        ticketId: parseInt(ticketId),
        reason: value.reason,
        refundAmount: value.refundAmount
      }
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error requesting refund:', error);
    
    if (error.message.includes('not found') || error.message.includes('does not belong')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('Cannot refund') || error.message.includes('not allowed')) {
      return res.status(409).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/refunds/:refundId/approve
 * Approve a pending refund (admin/organizer only)
 * @param {number} refundId - Refund request ID
 */
router.post('/:refundId/approve', verifyToken, async (req, res) => {
  try {
    // Verify user is admin or organizer
    if (req.user.role !== 'admin' && req.user.role !== 'organizer') {
      return res.status(403).json({ error: 'Only admins and organizers can approve refunds' });
    }

    const { refundId } = req.params;

    if (isNaN(refundId)) {
      return res.status(400).json({ error: 'Invalid refund ID' });
    }

    // If organizer, verify they own the event
    if (req.user.role === 'organizer') {
      const refund = await db('ticket_refunds')
        .select('ticket_refunds.*', 'events.organizer_id')
        .join('tickets', 'ticket_refunds.ticket_id', 'tickets.id')
        .join('events', 'tickets.event_id', 'events.id')
        .where('ticket_refunds.id', parseInt(refundId))
        .first();

      if (refund && refund.organizer_id !== req.user.id) {
        return res.status(403).json({ error: 'You do not organize this event' });
      }
    }

    const result = await ticketTransferService.approveRefund(
      parseInt(refundId),
      req.user.id
    );

    await auditService.logAction({
      userId: req.user.id,
      action: 'APPROVE_TICKET_REFUND',
      resourceType: 'ticket_refund',
      resourceId: parseInt(refundId),
      changes: { refundAmount: result.refundAmount }
    });

    res.json(result);
  } catch (error) {
    console.error('Error approving refund:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/refunds/:refundId/reject
 * Reject a pending refund (admin/organizer only)
 * @param {number} refundId - Refund request ID
 * @body {string} rejectionReason - Reason for rejection
 */
router.post('/:refundId/reject', verifyToken, async (req, res) => {
  try {
    // Verify user is admin or organizer
    if (req.user.role !== 'admin' && req.user.role !== 'organizer') {
      return res.status(403).json({ error: 'Only admins and organizers can reject refunds' });
    }

    const schema = Joi.object({
      rejectionReason: Joi.string().required().min(5).max(500)
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { refundId } = req.params;

    if (isNaN(refundId)) {
      return res.status(400).json({ error: 'Invalid refund ID' });
    }

    // If organizer, verify they own the event
    if (req.user.role === 'organizer') {
      const refund = await db('ticket_refunds')
        .select('ticket_refunds.*', 'events.organizer_id')
        .join('tickets', 'ticket_refunds.ticket_id', 'tickets.id')
        .join('events', 'tickets.event_id', 'events.id')
        .where('ticket_refunds.id', parseInt(refundId))
        .first();

      if (refund && refund.organizer_id !== req.user.id) {
        return res.status(403).json({ error: 'You do not organize this event' });
      }
    }

    const result = await ticketTransferService.rejectRefund(
      parseInt(refundId),
      value.rejectionReason,
      req.user.id
    );

    await auditService.logAction({
      userId: req.user.id,
      action: 'REJECT_TICKET_REFUND',
      resourceType: 'ticket_refund',
      resourceId: parseInt(refundId),
      changes: { rejectionReason: value.rejectionReason }
    });

    res.json(result);
  } catch (error) {
    console.error('Error rejecting refund:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tickets/:ticketId/transfer-history
 * Get transfer history for a ticket
 * @param {number} ticketId - Ticket ID
 */
router.get('/:ticketId/transfer-history', async (req, res) => {
  try {
    const { ticketId } = req.params;

    if (isNaN(ticketId)) {
      return res.status(400).json({ error: 'Invalid ticket ID' });
    }

    const history = await ticketTransferService.getTransferHistory(parseInt(ticketId));

    res.json({ data: history, count: history.length });
  } catch (error) {
    console.error('Error fetching transfer history:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tickets/:ticketId/refund-history
 * Get refund history for a ticket
 * @param {number} ticketId - Ticket ID
 */
router.get('/:ticketId/refund-history', async (req, res) => {
  try {
    const { ticketId } = req.params;

    if (isNaN(ticketId)) {
      return res.status(400).json({ error: 'Invalid ticket ID' });
    }

    const history = await ticketTransferService.getRefundHistory(parseInt(ticketId));

    res.json({ data: history, count: history.length });
  } catch (error) {
    console.error('Error fetching refund history:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tickets/transfers/pending
 * Get pending transfers for current user
 * @query {string} role - Filter: incoming, outgoing, all (default: all)
 */
router.get('/transfers/pending', verifyToken, async (req, res) => {
  try {
    const { role = 'all' } = req.query;

    if (!['incoming', 'outgoing', 'all'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role parameter' });
    }

    const transfers = await ticketTransferService.getPendingTransfers(req.user.id, role);

    res.json({ data: transfers, count: transfers.length });
  } catch (error) {
    console.error('Error fetching pending transfers:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/refunds/pending
 * Get pending refunds for review (admin/organizer only)
 */
router.get('/refunds/pending', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'organizer') {
      return res.status(403).json({ error: 'Only admins and organizers can view pending refunds' });
    }

    const organizerId = req.user.role === 'organizer' ? req.user.id : null;
    const refunds = await ticketTransferService.getPendingRefunds(organizerId);

    res.json({ data: refunds, count: refunds.length });
  } catch (error) {
    console.error('Error fetching pending refunds:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/events/:eventId/refund-stats
 * Get refund statistics for an event
 * @param {number} eventId - Event ID
 */
router.get('/events/:eventId/refund-stats', async (req, res) => {
  try {
    const { eventId } = req.params;

    if (isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    const stats = await ticketTransferService.getRefundStats(parseInt(eventId));

    res.json(stats);
  } catch (error) {
    console.error('Error fetching refund stats:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
