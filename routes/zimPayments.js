const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { verifyToken } = require('../middleware/auth');
const zimPaymentService = require('../services/zimPaymentService');
const auditService = require('../services/auditService');

/**
 * GET /api/payments/zim/methods
 * Get available ZIM payment methods
 */
router.get('/zim/methods', async (req, res) => {
  try {
    const methods = await zimPaymentService.getAvailablePaymentMethods();
    res.json({ data: methods, count: methods.length });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payments/zim/initiate
 * Initiate a Zimbabwe payment transaction
 * @body {number} amount - Amount in ZWL
 * @body {string} paymentMethod - Method (ecocash, innbucks, telecash, zimswitch)
 * @body {string} phoneNumber - Mobile number (+263 or 07xx format)
 * @body {number} eventId - Associated event ID (optional)
 */
router.post('/zim/initiate', verifyToken, async (req, res) => {
  try {
    const schema = Joi.object({
      amount: Joi.number().required().positive().max(50000),
      paymentMethod: Joi.string().required().valid('ecocash', 'innbucks', 'telecash', 'zimswitch'),
      phoneNumber: Joi.string().required().pattern(/^(\+263|0)[0-9]{9}$/),
      eventId: Joi.number().optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const result = await zimPaymentService.initiatePayment(
      req.user.id,
      value.amount,
      value.paymentMethod,
      value.phoneNumber,
      value.eventId || null
    );

    await auditService.logAction({
      userId: req.user.id,
      action: 'INITIATE_ZIM_PAYMENT',
      resourceType: 'payment',
      resourceId: result.paymentId,
      changes: {
        amount: value.amount,
        method: value.paymentMethod,
        totalAmount: result.totalAmount
      }
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error initiating payment:', error);
    
    if (error.message.includes('Invalid') || error.message.includes('Amount must')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payments/zim/webhook
 * Handle payment provider webhook callback (no auth required)
 * @body {string} provider - Payment provider name
 * @body {string} reference - Transaction reference
 * @body {string} status - Payment status
 * @body {number} amount - Payment amount
 * @body {string} phone_number - Phone number used
 */
router.post('/zim/webhook', async (req, res) => {
  try {
    const schema = Joi.object({
      provider: Joi.string().required(),
      reference: Joi.string().required(),
      status: Joi.string().required().valid('success', 'pending', 'failed', 'completed', 'processing', 'SUCCESS', 'PENDING'),
      amount: Joi.number().required(),
      phone_number: Joi.string().optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const result = await zimPaymentService.handlePaymentCallback(value.provider, value);

    res.json(result);
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payments/:paymentId/status
 * Get payment status
 * @param {number} paymentId - Payment ID
 */
router.get('/:paymentId/status', verifyToken, async (req, res) => {
  try {
    const { paymentId } = req.params;

    if (isNaN(paymentId)) {
      return res.status(400).json({ error: 'Invalid payment ID' });
    }

    const status = await zimPaymentService.getPaymentStatus(parseInt(paymentId));

    res.json(status);
  } catch (error) {
    console.error('Error getting payment status:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payments/:paymentId/verify
 * Verify payment legitimacy (anti-fraud)
 * @param {number} paymentId - Payment ID
 */
router.post('/:paymentId/verify', async (req, res) => {
  try {
    const { paymentId } = req.params;

    if (isNaN(paymentId)) {
      return res.status(400).json({ error: 'Invalid payment ID' });
    }

    const result = await zimPaymentService.verifyPayment(parseInt(paymentId));

    res.json(result);
  } catch (error) {
    console.error('Error verifying payment:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payments/:paymentId/refund
 * Refund a completed payment
 * @param {number} paymentId - Payment ID to refund
 * @body {string} reason - Refund reason
 */
router.post('/:paymentId/refund', verifyToken, async (req, res) => {
  try {
    const schema = Joi.object({
      reason: Joi.string().required().min(10).max(500)
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { paymentId } = req.params;

    if (isNaN(paymentId)) {
      return res.status(400).json({ error: 'Invalid payment ID' });
    }

    const result = await zimPaymentService.processRefund(
      parseInt(paymentId),
      value.reason
    );

    await auditService.logAction({
      userId: req.user.id,
      action: 'REQUEST_PAYMENT_REFUND',
      resourceType: 'payment',
      resourceId: parseInt(paymentId),
      changes: { reason: value.reason }
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error processing refund:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payments/history
 * Get transaction history for current user
 * @query {number} limit - Results limit (default 50)
 * @query {number} offset - Pagination offset (default 0)
 */
router.get('/history', verifyToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const offsetNum = parseInt(offset) || 0;

    const transactions = await zimPaymentService.getTransactionHistory(
      req.user.id,
      limitNum,
      offsetNum
    );

    res.json({ data: transactions, count: transactions.length });
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payments/zim/statistics
 * Get payment statistics (admin only)
 */
router.get('/zim/statistics', verifyToken, async (req, res) => {
  try {
    // Verify admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can view payment statistics' });
    }

    const stats = await zimPaymentService.getPaymentStatistics();

    res.json(stats);
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
