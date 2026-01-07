const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const auditService = require('../services/auditService');
const reportService = require('../services/reportService');
const fraudDetectionService = require('../services/fraudDetectionService');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Admin Dashboard Routes
 * All routes require admin role
 */

// Middleware: Verify admin role
router.use(verifyToken);
router.use(requireRole('admin'));

/**
 * Dashboard Overview
 */
router.get('/overview', async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Total users
    const totalUsers = await db('users')
      .count('* as count')
      .whereNull('deleted_at')
      .first();

    // New users (last 30 days)
    const newUsers = await db('users')
      .count('* as count')
      .where('created_at', '>=', thirtyDaysAgo)
      .whereNull('deleted_at')
      .first();

    // Total events
    const totalEvents = await db('events')
      .count('* as count')
      .whereNull('deleted_at')
      .first();

    // Active events
    const activeEvents = await db('events')
      .count('* as count')
      .where('status', 'published')
      .where('start_date', '>=', new Date())
      .whereNull('deleted_at')
      .first();

    // Total revenue
    const revenue = await db('payments')
      .sum('amount as total')
      .where('status', 'completed')
      .where('payment_date', '>=', thirtyDaysAgo)
      .first();

    // Total transactions
    const transactions = await db('payments')
      .count('* as count')
      .where('status', 'completed')
      .where('payment_date', '>=', thirtyDaysAgo)
      .first();

    // Suspicious transactions
    const suspiciousTransactions = await db('payments')
      .count('* as count')
      .where('is_suspicious', true)
      .where('payment_date', '>=', thirtyDaysAgo)
      .first();

    // Venues
    const totalVenues = await db('venues')
      .count('* as count')
      .whereNull('deleted_at')
      .first();

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers.count,
          newLastMonth: newUsers.count
        },
        events: {
          total: totalEvents.count,
          active: activeEvents.count
        },
        payments: {
          totalRevenue: parseFloat(revenue.total) || 0,
          totalTransactions: transactions.count,
          suspiciousTransactions: suspiciousTransactions.count
        },
        venues: {
          total: totalVenues.count
        }
      }
    });
  } catch (error) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard overview',
      error: error.message
    });
  }
});

/**
 * User Management
 */
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const role = req.query.role;
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = req.query.sortOrder || 'desc';

    let query = db('users').whereNull('deleted_at');

    if (role) {
      query = query.where('role', role);
    }

    // Count total
    const countResult = await query.clone().count('* as count').first();
    const total = countResult.count;

    // Get paginated results
    const users = await query
      .select('id', 'email', 'first_name', 'last_name', 'role', 'is_active', 'email_verified', 'phone_verified', 'created_at', 'last_login_at')
      .orderBy(sortBy, sortOrder)
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      data: {
        users: users,
        pagination: {
          total: total,
          page: page,
          limit: limit,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
});

/**
 * Get user details
 */
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await db('users')
      .where('id', userId)
      .whereNull('deleted_at')
      .first();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user activity
    const recentActivity = await auditService.getUserActivityTimeline(userId, {
      limit: 20
    });

    // Get user payments
    const payments = await db('payments')
      .where('user_id', userId)
      .orderBy('payment_date', 'desc')
      .limit(10);

    // Get user tickets
    const tickets = await db('tickets')
      .where('user_id', userId)
      .whereNull('deleted_at')
      .count('* as count')
      .first();

    res.json({
      success: true,
      data: {
        user: user,
        activity: recentActivity,
        payments: payments,
        ticketCount: tickets.count
      }
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user details',
      error: error.message
    });
  }
});

/**
 * Deactivate user
 */
router.put('/users/:userId/deactivate', async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const user = await db('users').where('id', userId).first();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await db('users').where('id', userId).update({
      is_active: false,
      updated_at: db.fn.now()
    });

    await auditService.log({
      userId: req.user.id,
      action: 'USER_DEACTIVATED',
      resource: 'users',
      resourceId: userId,
      newValues: { is_active: false },
      metadata: { reason }
    });

    res.json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deactivating user',
      error: error.message
    });
  }
});

/**
 * Delete user (soft delete)
 */
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const user = await db('users').where('id', userId).first();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await db('users').where('id', userId).update({
      deleted_at: db.fn.now(),
      is_active: false
    });

    await auditService.log({
      userId: req.user.id,
      action: 'USER_DELETED',
      resource: 'users',
      resourceId: userId,
      oldValues: user,
      metadata: { reason, softDelete: true }
    });

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message
    });
  }
});

/**
 * Event Management
 */
router.get('/events', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let query = db('events').whereNull('deleted_at');

    if (status) {
      query = query.where('status', status);
    }

    const countResult = await query.clone().count('* as count').first();
    const total = countResult.count;

    const events = await query
      .select('id', 'title', 'event_type', 'status', 'start_date', 'total_capacity', 'sold_tickets', 'created_at')
      .orderBy('start_date', 'desc')
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      data: {
        events: events,
        pagination: {
          total: total,
          page: page,
          limit: limit,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching events',
      error: error.message
    });
  }
});

/**
 * Approve/Reject event
 */
router.put('/events/:eventId/approve', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { approved } = req.body;

    const event = await db('events').where('id', eventId).first();

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    const newStatus = approved ? 'published' : 'rejected';

    await db('events').where('id', eventId).update({
      status: newStatus,
      updated_at: db.fn.now()
    });

    await auditService.log({
      userId: req.user.id,
      action: 'EVENT_' + newStatus.toUpperCase(),
      resource: 'events',
      resourceId: eventId,
      metadata: { approved }
    });

    res.json({
      success: true,
      message: `Event ${newStatus} successfully`,
      newStatus: newStatus
    });
  } catch (error) {
    console.error('Event approval error:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving event',
      error: error.message
    });
  }
});

/**
 * Fraud Detection Dashboard
 */
router.get('/fraud/suspicious-transactions', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();

    const suspiciousTransactions = await fraudDetectionService.getSuspiciousTransactions({
      startDate: startDate,
      endDate: endDate,
      limit: 100
    });

    res.json({
      success: true,
      data: {
        transactions: suspiciousTransactions,
        count: suspiciousTransactions.length,
        period: { startDate, endDate }
      }
    });
  } catch (error) {
    console.error('Get suspicious transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching suspicious transactions',
      error: error.message
    });
  }
});

/**
 * Audit Logs
 */
router.get('/audit-logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const action = req.query.action;
    const resource = req.query.resource;
    const userId = req.query.userId;
    const isSuspicious = req.query.isSuspicious === 'true';

    const filters = {
      page: page,
      limit: limit,
      action: action,
      resource: resource,
      userId: userId,
      isSuspicious: isSuspicious ? true : undefined
    };

    const logs = await auditService.getLogs(filters);

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching audit logs',
      error: error.message
    });
  }
});

/**
 * Reports
 */
router.get('/reports/sales', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : undefined;
    const format = req.query.format || 'json'; // json or csv

    const report = await reportService.generateSalesReport({
      startDate: startDate,
      endDate: endDate
    });

    if (format === 'csv') {
      const csv = await reportService.exportReportAsCSV(report, 'sales');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="sales-report.csv"');
      return res.send(csv);
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Sales report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating sales report',
      error: error.message
    });
  }
});

/**
 * Attendance Report
 */
router.get('/reports/attendance', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : undefined;
    const format = req.query.format || 'json';

    const report = await reportService.generateAttendanceReport({
      startDate: startDate,
      endDate: endDate
    });

    if (format === 'csv') {
      const csv = await reportService.exportReportAsCSV(report, 'attendance');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="attendance-report.csv"');
      return res.send(csv);
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Attendance report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating attendance report',
      error: error.message
    });
  }
});

/**
 * Fraud Report
 */
router.get('/reports/fraud', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : undefined;
    const format = req.query.format || 'json';

    const report = await reportService.generateFraudReport({
      startDate: startDate,
      endDate: endDate
    });

    if (format === 'csv') {
      const csv = await reportService.exportReportAsCSV(report, 'fraud');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="fraud-report.csv"');
      return res.send(csv);
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Fraud report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating fraud report',
      error: error.message
    });
  }
});

/**
 * User Report
 */
router.get('/reports/users', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : undefined;
    const format = req.query.format || 'json';

    const report = await reportService.generateUserReport({
      startDate: startDate,
      endDate: endDate
    });

    if (format === 'csv') {
      const csv = await reportService.exportReportAsCSV(report, 'user');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="user-report.csv"');
      return res.send(csv);
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('User report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating user report',
      error: error.message
    });
  }
});

/**
 * System Settings
 */
router.get('/settings', async (req, res) => {
  try {
    // Get system settings from database (you'd need a settings table)
    // For now, returning placeholder
    res.json({
      success: true,
      data: {
        platformName: 'TicketPro',
        currency: 'USD',
        maxFileUploadSize: 10485760, // 10MB
        smtpConfigured: !!process.env.SMTP_HOST,
        paymentGateways: {
          stripe: !!process.env.STRIPE_SECRET_KEY,
          paypal: !!process.env.PAYPAL_CLIENT_ID,
          zimGateway: !!process.env.ZIM_GATEWAY_URL
        }
      }
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching settings',
      error: error.message
    });
  }
});

module.exports = router;
