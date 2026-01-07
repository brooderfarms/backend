const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { verifyToken } = require('../middleware/auth');
const approvalPaymentService = require('../services/approvalPaymentService');

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
 * GET /api/admin/approvals/pending
 * Get all pending organizers and venue managers for approval
 */
router.get('/pending', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { role, status } = req.query;
    const filters = {};

    if (status && ['pending', 'rejected'].includes(status)) {
      filters.approval_status = status;
    }

    const users = await approvalPaymentService.getPendingApprovals(role, filters);

    res.json({
      data: users,
      count: users.length
    });
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/approvals/stats
 * Get approval statistics
 */
router.get('/stats', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const stats = await approvalPaymentService.getApprovalStats();
    res.json({ data: stats });
  } catch (error) {
    console.error('Error fetching approval stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/approvals/:userId
 * Get approval details for a user
 */
router.get('/:userId', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await approvalPaymentService.getApprovalDetails(userId);

    res.json({ data: user });
  } catch (error) {
    console.error('Error fetching approval details:', error);
    res.status(404).json({ error: error.message });
  }
});

/**
 * POST /api/admin/approvals/:userId/approve
 * Approve an organizer or venue manager
 * Body: { commission_percentage?: number }
 */
router.post('/:userId/approve', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { commission_percentage } = req.body;

    // Validate commission percentage if provided
    if (commission_percentage) {
      if (commission_percentage < 0 || commission_percentage > 100) {
        return res.status(400).json({ error: 'Commission percentage must be between 0 and 100' });
      }
    }

    const user = await approvalPaymentService.approveUser(userId, req.user.id, {
      commission_percentage
    });

    res.json({
      message: 'User approved successfully',
      data: user
    });
  } catch (error) {
    console.error('Error approving user:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/approvals/:userId/reject
 * Reject an organizer or venue manager
 * Body: { reason: string }
 */
router.post('/:userId/reject', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    // Validate reason
    const schema = Joi.object({
      reason: Joi.string().required().min(10).max(500)
    });

    const { error } = schema.validate({ reason });
    if (error) {
      return res.status(400).json({ error: 'Reason is required and must be 10-500 characters' });
    }

    const user = await approvalPaymentService.rejectUser(userId, req.user.id, reason);

    res.json({
      message: 'User rejected successfully',
      data: user
    });
  } catch (error) {
    console.error('Error rejecting user:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/approvals/:userId/suspend
 * Suspend an approved user
 * Body: { reason: string }
 */
router.post('/:userId/suspend', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ error: 'Reason is required' });
    }

    const user = await approvalPaymentService.suspendUser(userId, req.user.id, reason);

    res.json({
      message: 'User suspended successfully',
      data: user
    });
  } catch (error) {
    console.error('Error suspending user:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
