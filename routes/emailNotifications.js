const express = require('express');
const router = express.Router();
const emailNotificationService = require('../services/emailNotificationService');
const { verifyToken, requireRole } = require('../middleware/auth');

/**
 * Send purchase confirmation email for a payment
 * POST /api/emails/send-purchase-confirmation/:paymentId
 */
router.post('/send-purchase-confirmation/:paymentId', verifyToken, async (req, res) => {
  try {
    const { paymentId } = req.params;

    // Verify user owns this payment or is admin
    const db = require('../config/database');
    const payment = await db('payments').where('id', paymentId).first();

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    if (req.user.role !== 'admin' && payment.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    await emailNotificationService.sendPurchaseConfirmation(paymentId);

    res.json({
      success: true,
      message: 'Purchase confirmation email sent successfully'
    });
  } catch (error) {
    console.error('Error sending purchase confirmation:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send purchase confirmation'
    });
  }
});

/**
 * Send abandoned cart reminder emails
 * POST /api/emails/send-cart-reminders
 * Admin only
 */
router.post('/send-cart-reminders', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { hoursThreshold = 4 } = req.body;

    const result = await emailNotificationService.sendAbandonedCartReminders(hoursThreshold);

    res.json({
      success: true,
      message: `Cart reminders sent`,
      data: result
    });
  } catch (error) {
    console.error('Error sending cart reminders:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send cart reminders'
    });
  }
});

/**
 * Send event reminder emails to ticket holders
 * POST /api/emails/send-event-reminders/:eventId
 * Admin or organizer only
 */
router.post('/send-event-reminders/:eventId', verifyToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { hoursBefore = 24 } = req.body;

    // Verify user owns the event or is admin
    const db = require('../config/database');
    const event = await db('events').where('id', eventId).first();

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    if (req.user.role !== 'admin' && event.organizer_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const result = await emailNotificationService.sendEventReminderEmails(eventId, hoursBefore);

    res.json({
      success: true,
      message: `Event reminders sent`,
      data: result
    });
  } catch (error) {
    console.error('Error sending event reminders:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send event reminders'
    });
  }
});

module.exports = router;
