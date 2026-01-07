/**
 * Payment Routes - Multi-Gateway Support
 * Ecocash, Zipit, Zimswitch, Innbucks, PayPal, Visa, Mastercard
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const PaymentGatewayService = require('../services/paymentGatewayService');
const db = require('../config/database');

/**
 * GET /api/payments
 * List all payments with pagination and filters
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, method_code, user_id } = req.query;
    const offset = (page - 1) * limit;

    let query = db('payment_transactions');

    // Only admins can view all payments; others see their own
    if (req.user.role !== 'admin') {
      query = query.where({ user_id: req.user.id });
    } else if (user_id) {
      query = query.where({ user_id });
    }

    if (status) {
      query = query.where({ status });
    }

    if (method_code) {
      query = query.where({ method_code });
    }

    const total = await query.clone().count('* as count').first();
    const payments = await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      data: payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total.count,
        pages: Math.ceil(total.count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/payments/methods
 * Get all available payment methods
 */
router.get('/methods', async (req, res) => {
  try {
    const methods = await PaymentGatewayService.getAvailablePaymentMethods();
    res.json({ success: true, data: methods });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payments/methods/:category
 * Get payment methods by category (local, international, card)
 */
router.get('/methods/:category', async (req, res) => {
  try {
    const methods = await PaymentGatewayService.getPaymentMethodsByCategory(req.params.category);
    res.json({ success: true, data: methods });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payments/process
 * Process a payment with specified gateway
 */
router.post('/process', verifyToken, async (req, res) => {
  try {
    const { amount, method_code, reference, description, order_id } = req.body;

    if (!amount || !method_code || !reference) {
      return res.status(400).json({
        error: 'Missing required fields: amount, method_code, reference'
      });
    }

    const paymentResult = await PaymentGatewayService.processPayment({
      amount,
      method_code,
      reference,
      description,
      user_id: req.user.id,
      order_id,
      currency: 'ZWL'
    });

    res.json({
      success: true,
      data: paymentResult
    });
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payments/:transaction_id
 * Get payment transaction details
 */
router.get('/:transaction_id', verifyToken, async (req, res) => {
  try {
    const transaction = await db('payment_transactions')
      .where({ id: req.params.transaction_id })
      .first();

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Check authorization
    if (transaction.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json({ success: true, data: transaction });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payments/:transaction_id/confirm
 * Confirm payment after gateway processing
 */
router.post('/:transaction_id/confirm', verifyToken, async (req, res) => {
  try {
    const { gateway_response } = req.body;

    const result = await PaymentGatewayService.confirmPayment(
      req.params.transaction_id,
      gateway_response
    );

    res.json(result);
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payments/:transaction_id/refund
 * Refund a payment
 */
router.post('/:transaction_id/refund', verifyToken, async (req, res) => {
  try {
    // Check admin only
    const transaction = await db('payment_transactions')
      .where({ id: req.params.transaction_id })
      .first();

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can refund payments' });
    }

    const { refund_amount } = req.body;
    const result = await PaymentGatewayService.refundPayment(
      req.params.transaction_id,
      refund_amount
    );

    res.json(result);
  } catch (error) {
    console.error('Error refunding payment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * WEBHOOKS - Payment Gateway Confirmations
 */

/**
 * POST /api/payments/webhooks/ecocash
 */
router.post('/webhooks/ecocash', async (req, res) => {
  try {
    const { transaction_id, status } = req.body;
    if (status === 'completed') {
      await PaymentGatewayService.confirmPayment(transaction_id, req.body);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Ecocash webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payments/webhooks/zipit
 */
router.post('/webhooks/zipit', async (req, res) => {
  try {
    const { transaction_id, status } = req.body;
    if (status === 'success') {
      await PaymentGatewayService.confirmPayment(transaction_id, req.body);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Zipit webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payments/webhooks/zimswitch
 */
router.post('/webhooks/zimswitch', async (req, res) => {
  try {
    const { transaction_reference, status } = req.body;
    if (status === 'completed') {
      const transaction = await db('payment_transactions')
        .where({ reference_number: transaction_reference })
        .first();
      if (transaction) {
        await PaymentGatewayService.confirmPayment(transaction.id, req.body);
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Zimswitch webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payments/webhooks/innbucks
 */
router.post('/webhooks/innbucks', async (req, res) => {
  try {
    const { reference_number, status } = req.body;
    if (status === 'completed' || status === 'successful') {
      const transaction = await db('payment_transactions')
        .where({ reference_number })
        .first();
      if (transaction) {
        await PaymentGatewayService.confirmPayment(transaction.id, req.body);
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Innbucks webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payments/webhooks/paypal
 */
router.post('/webhooks/paypal', async (req, res) => {
  try {
    const { id, status } = req.body;
    if (status === 'COMPLETED' || status === 'APPROVED') {
      const transaction = await db('payment_transactions')
        .where({ gateway_transaction_id: id })
        .first();
      if (transaction) {
        await PaymentGatewayService.confirmPayment(transaction.id, req.body);
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error('PayPal webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payments/webhooks/card
 */
router.post('/webhooks/card', async (req, res) => {
  try {
    const { reference, status } = req.body;
    if (status === 'success' || status === 'completed') {
      const transaction = await db('payment_transactions')
        .where({ reference_number: reference })
        .first();
      if (transaction) {
        await PaymentGatewayService.confirmPayment(transaction.id, req.body);
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Card payment webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
