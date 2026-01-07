const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireRole } = require('../middleware/auth');
const CommissionService = require('../services/commissionService');

/**
 * GET /api/commissions/vendor/:vendorId - Get vendor commissions
 */
router.get('/vendor/:vendorId', verifyToken, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { status, startDate, endDate } = req.query;

    // Verify vendor owns this data
    const vendor = await db('vendors').where('id', vendorId).first();
    if (!vendor || vendor.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const commissions = await CommissionService.getVendorCommissions(vendorId, {
      status,
      startDate,
      endDate
    });

    const summary = await CommissionService.calculateVendorRevenue(
      vendorId,
      startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate || new Date()
    );

    res.json({
      success: true,
      data: {
        commissions,
        summary
      }
    });
  } catch (error) {
    console.error('Get commissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch commissions' });
  }
});

/**
 * GET /api/commissions/vendor/:vendorId/payouts - Get vendor payouts
 */
router.get('/vendor/:vendorId/payouts', verifyToken, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;

    // Verify vendor owns this data
    const vendor = await db('vendors').where('id', vendorId).first();
    if (!vendor || vendor.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const payouts = await CommissionService.getVendorPayouts(vendorId, {
      status,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: payouts
    });
  } catch (error) {
    console.error('Get payouts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch payouts' });
  }
});

/**
 * GET /api/commissions/vendor/:vendorId/reports - Get commission reports
 */
router.get('/vendor/:vendorId/reports', verifyToken, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { limit = 12 } = req.query;

    // Verify vendor owns this data
    const vendor = await db('vendors').where('id', vendorId).first();
    if (!vendor || vendor.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const reports = await CommissionService.getCommissionReports(vendorId, parseInt(limit));

    res.json({
      success: true,
      data: { reports }
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch reports' });
  }
});

/**
 * POST /api/commissions/record - Record a commission (internal use)
 */
router.post('/record', async (req, res) => {
  try {
    const { vendorId, orderId, productId, saleAmount, commissionRate } = req.body;

    if (!vendorId || !saleAmount) {
      return res.status(400).json({
        success: false,
        message: 'vendorId and saleAmount are required'
      });
    }

    const commission = await CommissionService.recordCommission(vendorId, {
      orderId,
      productId,
      saleAmount,
      commissionRate
    });

    res.status(201).json({
      success: true,
      message: 'Commission recorded',
      data: commission
    });
  } catch (error) {
    console.error('Record commission error:', error);
    res.status(500).json({ success: false, message: 'Failed to record commission' });
  }
});

/**
 * POST /api/commissions/vendor/:vendorId/payout - Create payout (admin)
 */
router.post('/vendor/:vendorId/payout', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { periodStart, periodEnd, paymentMethod = 'bank_transfer', notes } = req.body;

    // Get revenue data
    const revenue = await CommissionService.calculateVendorRevenue(vendorId, periodStart, periodEnd);

    // Create payout
    const payout = await CommissionService.createPayout(vendorId, {
      periodStart,
      periodEnd,
      grossRevenue: revenue.totalSales,
      totalCommissions: revenue.totalCommissions,
      paymentMethod,
      notes
    });

    res.status(201).json({
      success: true,
      message: 'Payout created',
      data: payout
    });
  } catch (error) {
    console.error('Create payout error:', error);
    res.status(500).json({ success: false, message: 'Failed to create payout' });
  }
});

/**
 * POST /api/commissions/vendor/:vendorId/report - Generate monthly report (admin)
 */
router.post('/vendor/:vendorId/report', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { year, month } = req.body;

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: 'year and month are required'
      });
    }

    const report = await CommissionService.generateMonthlyReport(vendorId, year, month);

    res.json({
      success: true,
      message: 'Report generated',
      data: report
    });
  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate report' });
  }
});

/**
 * GET /api/commissions/admin/all - Get all commissions (admin)
 */
router.get('/admin/all', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { vendorId, status, limit = 100, offset = 0 } = req.query;

    let query = db('commission_transactions').orderBy('created_at', 'desc');

    if (vendorId) {
      query = query.where('vendor_id', vendorId);
    }

    if (status) {
      query = query.where('status', status);
    }

    const commissions = await query
      .limit(limit)
      .offset(offset);

    const totalCount = await db('commission_transactions').count('* as count').first();

    res.json({
      success: true,
      data: {
        commissions,
        pagination: {
          limit,
          offset,
          total: totalCount.count
        }
      }
    });
  } catch (error) {
    console.error('Get all commissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch commissions' });
  }
});

module.exports = router;
