const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { verifyToken } = require('../middleware/auth');
const approvalPaymentService = require('../services/approvalPaymentService');
const db = require('../config/database');

/**
 * Middleware to verify user is organizer or venue manager
 */
const verifyOrganizerOrVenueManager = (req, res, next) => {
  if (!['organizer', 'venue_manager', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Organizer or venue manager access required' });
  }
  next();
};

/**
 * Middleware to verify admin role
 */
const verifyAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

/**
 * GET /api/payouts/info
 * Get payment information for current user
 */
router.get('/info', verifyToken, verifyOrganizerOrVenueManager, async (req, res) => {
  try {
    const paymentInfo = await approvalPaymentService.getPaymentInfo(req.user.id);
    res.json({ data: paymentInfo });
  } catch (error) {
    console.error('Error fetching payment info:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/payouts/info
 * Update payment information for current user
 * Body: { payment_method, and fields based on method }
 */
router.put('/info', verifyToken, verifyOrganizerOrVenueManager, async (req, res) => {
  try {
    const { payment_method, accountNumber, bankCode, bankName, accountHolderName, ecocashNumber, innbucksNumber, cashPickupLocation, cashPickupDetails } = req.body;

    // Validate payment method
    const validMethods = ['bank', 'ecocash', 'innbucks', 'cash'];
    if (!payment_method || !validMethods.includes(payment_method)) {
      return res.status(400).json({ error: 'Valid payment method is required' });
    }

    let schema;
    let payloadData;

    // Validate based on payment method
    if (payment_method === 'bank') {
      schema = Joi.object({
        payment_method: Joi.string().required(),
        accountNumber: Joi.string().required().min(8).max(100),
        bankCode: Joi.string().required().min(2).max(20),
        bankName: Joi.string().required().min(3).max(100),
        accountHolderName: Joi.string().required().min(3).max(100)
      });

      payloadData = {
        payment_method,
        accountNumber,
        bankCode,
        bankName,
        accountHolderName
      };
    } else if (payment_method === 'ecocash') {
      schema = Joi.object({
        payment_method: Joi.string().required(),
        ecocashNumber: Joi.string().required().min(10)
      });

      payloadData = {
        payment_method,
        ecocashNumber
      };
    } else if (payment_method === 'innbucks') {
      schema = Joi.object({
        payment_method: Joi.string().required(),
        innbucksNumber: Joi.string().required().min(10)
      });

      payloadData = {
        payment_method,
        innbucksNumber
      };
    } else if (payment_method === 'cash') {
      schema = Joi.object({
        payment_method: Joi.string().required(),
        cashPickupLocation: Joi.string().required().min(3).max(200),
        cashPickupDetails: Joi.string().required().min(5).max(500)
      });

      payloadData = {
        payment_method,
        cashPickupLocation,
        cashPickupDetails
      };
    }

    const { error } = schema.validate(payloadData);

    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const paymentInfo = await approvalPaymentService.updatePaymentInfo(req.user.id, payloadData);

    res.json({
      message: 'Payment information updated. Awaiting verification.',
      data: paymentInfo
    });
  } catch (error) {
    console.error('Error updating payment info:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payouts/history
 * Get payout history for current user
 * Query: { status, startDate, endDate }
 */
router.get('/history', verifyToken, verifyOrganizerOrVenueManager, async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    const filters = {};

    if (status && ['pending', 'approved', 'processing', 'completed', 'failed', 'rejected'].includes(status)) {
      filters.status = status;
    }

    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const payouts = await approvalPaymentService.getPayoutHistory(req.user.id, filters);

    res.json({
      data: payouts,
      count: payouts.length
    });
  } catch (error) {
    console.error('Error fetching payout history:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payouts/request
 * Request a payout
 * Body: { amount, currency?, paymentMethod?, notes?, periodStart?, periodEnd?, metadata? }
 */
router.post('/request', verifyToken, verifyOrganizerOrVenueManager, async (req, res) => {
  try {
    const { amount, currency, paymentMethod, notes, periodStart, periodEnd, metadata } = req.body;

    // Validate input
    const schema = Joi.object({
      amount: Joi.number().positive().required(),
      currency: Joi.string().length(3).optional(),
      paymentMethod: Joi.string().valid('bank_transfer', 'mobile_money', 'check', 'wallet').optional(),
      notes: Joi.string().max(500).optional(),
      periodStart: Joi.date().optional(),
      periodEnd: Joi.date().optional(),
      metadata: Joi.object().optional()
    });

    const { error } = schema.validate({
      amount,
      currency,
      paymentMethod,
      notes,
      periodStart,
      periodEnd,
      metadata
    });

    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const payout = await approvalPaymentService.requestPayout(req.user.id, {
      amount,
      currency,
      paymentMethod,
      notes,
      periodStart,
      periodEnd,
      metadata
    });

    res.status(201).json({
      message: 'Payout request submitted successfully',
      data: payout
    });
  } catch (error) {
    console.error('Error requesting payout:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payouts/:payoutId
 * Get payout details
 */
router.get('/:payoutId', verifyToken, async (req, res) => {
  try {
    const { payoutId } = req.params;
    const payout = await approvalPaymentService.getPayoutDetails(payoutId);

    // Verify user owns this payout or is admin
    if (payout.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json({ data: payout });
  } catch (error) {
    console.error('Error fetching payout details:', error);
    res.status(404).json({ error: error.message });
  }
});

/**
 * ADMIN ROUTES
 */

/**
 * GET /api/payouts/admin/pending
 * Get all pending payout requests (admin only)
 */
router.get('/admin/pending', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const payouts = await db('payouts')
      .where('status', 'pending')
      .where('deleted_at', null)
      .leftJoin('users', 'payouts.user_id', 'users.id')
      .select(
        'payouts.id',
        'payouts.user_id',
        'users.first_name',
        'users.last_name',
        'users.email',
        'payouts.amount',
        'payouts.currency',
        'payouts.payment_method',
        'payouts.created_at'
      )
      .orderBy('payouts.created_at', 'asc');

    res.json({
      data: payouts,
      count: payouts.length
    });
  } catch (error) {
    console.error('Error fetching pending payouts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payouts/admin/:payoutId/approve
 * Approve a payout request (admin only)
 */
router.post('/admin/:payoutId/approve', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { payoutId } = req.params;
    const payout = await approvalPaymentService.approvePayout(payoutId, req.user.id);

    res.json({
      message: 'Payout approved successfully',
      data: payout
    });
  } catch (error) {
    console.error('Error approving payout:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payouts/admin/:payoutId/reject
 * Reject a payout request (admin only)
 * Body: { reason: string }
 */
router.post('/admin/:payoutId/reject', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { payoutId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ error: 'Reason is required' });
    }

    const payout = await approvalPaymentService.rejectPayout(payoutId, req.user.id, reason);

    res.json({
      message: 'Payout rejected successfully',
      data: payout
    });
  } catch (error) {
    console.error('Error rejecting payout:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payouts/admin/:payoutId/process
 * Mark payout as processing (admin only)
 */
router.post('/admin/:payoutId/process', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { payoutId } = req.params;
    const payout = await approvalPaymentService.processPayout(payoutId);

    res.json({
      message: 'Payout marked as processing',
      data: payout
    });
  } catch (error) {
    console.error('Error processing payout:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payouts/admin/:payoutId/complete
 * Mark payout as completed (admin only)
 * Body: { transactionId: string }
 */
router.post('/admin/:payoutId/complete', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { payoutId } = req.params;
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }

    const payout = await approvalPaymentService.completePayout(payoutId, transactionId);

    res.json({
      message: 'Payout completed successfully',
      data: payout
    });
  } catch (error) {
    console.error('Error completing payout:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payouts/admin/:userId/verify-payment
 * Verify payment information for a user (admin only)
 * Body: { approved: boolean, reason?: string }
 */
router.post('/admin/:userId/verify-payment', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { approved, reason } = req.body;

    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'Approved must be a boolean' });
    }

    const paymentInfo = await approvalPaymentService.verifyPaymentInfo(
      userId,
      req.user.id,
      approved,
      reason
    );

    res.json({
      message: `Payment information ${approved ? 'verified' : 'rejected'}`,
      data: paymentInfo
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
