const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const auditService = require('../services/auditService');

/**
 * Audit Log Routes
 */

// Middleware: Verify token
router.use(verifyToken);

/**
 * Get audit logs (admin only)
 */
router.get('/logs', requireRole('admin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const action = req.query.action;
    const resource = req.query.resource;
    const userId = req.query.userId;
    const resourceId = req.query.resourceId;
    const isSuspicious = req.query.isSuspicious === 'true';
    const startDate = req.query.startDate ? new Date(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : undefined;

    const filters = {
      page: page,
      limit: limit,
      action: action,
      resource: resource,
      userId: userId,
      resourceId: resourceId,
      isSuspicious: isSuspicious ? true : undefined,
      startDate: startDate,
      endDate: endDate
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
 * Get user activity timeline
 */
router.get('/user/:userId/activity', requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const startDate = req.query.startDate ? new Date(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : undefined;
    const limit = parseInt(req.query.limit) || 100;

    const timeline = await auditService.getUserActivityTimeline(userId, {
      startDate: startDate,
      endDate: endDate,
      limit: limit
    });

    res.json({
      success: true,
      data: {
        userId: userId,
        activities: timeline,
        count: timeline.length
      }
    });
  } catch (error) {
    console.error('Get user activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user activity',
      error: error.message
    });
  }
});

/**
 * Get resource change history
 */
router.get('/resource/:resource/:resourceId/history', requireRole('admin'), async (req, res) => {
  try {
    const { resource, resourceId } = req.params;

    const history = await auditService.getResourceHistory(resource, resourceId);

    res.json({
      success: true,
      data: {
        resource: resource,
        resourceId: resourceId,
        history: history,
        count: history.length
      }
    });
  } catch (error) {
    console.error('Get resource history error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching resource history',
      error: error.message
    });
  }
});

/**
 * Get activity summary
 */
router.get('/summary', requireRole('admin'), async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : undefined;

    const summary = await auditService.getActivitySummary({
      startDate: startDate,
      endDate: endDate
    });

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Get activity summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching activity summary',
      error: error.message
    });
  }
});

/**
 * Get suspicious activities
 */
router.get('/suspicious', requireRole('admin'), async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    const userId = req.query.userId;
    const limit = parseInt(req.query.limit) || 100;

    const activities = await auditService.getSuspiciousActivities({
      startDate: startDate,
      endDate: endDate,
      userId: userId,
      limit: limit
    });

    res.json({
      success: true,
      data: {
        activities: activities,
        count: activities.length,
        period: { startDate, endDate }
      }
    });
  } catch (error) {
    console.error('Get suspicious activities error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching suspicious activities',
      error: error.message
    });
  }
});

/**
 * Export audit logs
 */
router.get('/export', requireRole('admin'), async (req, res) => {
  try {
    const format = req.query.format || 'json'; // json, csv
    const startDate = req.query.startDate ? new Date(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : undefined;
    const action = req.query.action;
    const resource = req.query.resource;

    const filters = {
      startDate: startDate,
      endDate: endDate,
      action: action,
      resource: resource,
      limit: 10000 // Export up to 10k records
    };

    const exported = await auditService.exportLogs(filters, format);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
      return res.send(exported);
    }

    res.json({
      success: true,
      data: exported,
      count: Array.isArray(exported) ? exported.length : 0
    });
  } catch (error) {
    console.error('Export audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting audit logs',
      error: error.message
    });
  }
});

/**
 * Get specific audit log entry
 */
router.get('/logs/:logId', requireRole('admin'), async (req, res) => {
  try {
    const { logId } = req.params;
    const db = require('../config/database');

    const log = await db('audit_logs')
      .where('id', logId)
      .first();

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Audit log not found'
      });
    }

    // Parse JSON fields
    if (log.old_values) {
      log.old_values = JSON.parse(log.old_values);
    }
    if (log.new_values) {
      log.new_values = JSON.parse(log.new_values);
    }
    if (log.metadata) {
      log.metadata = JSON.parse(log.metadata);
    }

    res.json({
      success: true,
      data: log
    });
  } catch (error) {
    console.error('Get audit log error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching audit log',
      error: error.message
    });
  }
});

module.exports = router;
