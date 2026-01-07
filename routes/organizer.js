const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { verifyToken } = require('../middleware/auth');
const organizerService = require('../services/organizerService');
const auditService = require('../services/auditService');

/**
 * Middleware to verify organizer role
 */
const verifyOrganizerRole = (req, res, next) => {
  if (req.user.role !== 'organizer' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Organizer access required' });
  }
  next();
};

/**
 * GET /api/organizer/dashboard
 * Get organizer dashboard overview
 * @query {string} period - 'month' | 'year' | 'all' (default: 'month')
 */
router.get('/dashboard', verifyToken, verifyOrganizerRole, async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    // Validate period
    const validPeriods = ['month', 'year', 'all'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be: month, year, or all' });
    }

    const overview = await organizerService.getDashboardOverview(req.user.id, period);

    // Log action
    await auditService.logAction({
      userId: req.user.id,
      action: 'VIEW_ORGANIZER_DASHBOARD',
      resourceType: 'organizer_dashboard',
      resourceId: req.user.id,
      changes: { period }
    });

    res.json(overview);
  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/organizer/revenue
 * Get revenue metrics by event
 * @query {string} period - 'month' | 'year' | 'all' (default: 'month')
 */
router.get('/revenue', verifyToken, verifyOrganizerRole, async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    const validPeriods = ['month', 'year', 'all'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be: month, year, or all' });
    }

    const revenue = await organizerService.getRevenueByEvent(req.user.id, period);

    await auditService.logAction({
      userId: req.user.id,
      action: 'VIEW_REVENUE_METRICS',
      resourceType: 'organizer_dashboard',
      resourceId: req.user.id,
      changes: { period }
    });

    res.json({ data: revenue, period });
  } catch (error) {
    console.error('Error fetching revenue metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/organizer/attendance
 * Get attendance metrics
 * @query {string} period - 'month' | 'year' | 'all' (default: 'month')
 */
router.get('/attendance', verifyToken, verifyOrganizerRole, async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    const validPeriods = ['month', 'year', 'all'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be: month, year, or all' });
    }

    const attendance = await organizerService.getAttendanceMetrics(req.user.id, period);

    await auditService.logAction({
      userId: req.user.id,
      action: 'VIEW_ATTENDANCE_METRICS',
      resourceType: 'organizer_dashboard',
      resourceId: req.user.id,
      changes: { period }
    });

    res.json({ data: attendance, period });
  } catch (error) {
    console.error('Error fetching attendance metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/organizer/events/:eventId/performance
 * Get event performance analytics
 * @param {number} eventId - Event ID
 */
router.get('/events/:eventId/performance', verifyToken, verifyOrganizerRole, async (req, res) => {
  try {
    const { eventId } = req.params;

    // Validate eventId is a number
    if (isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    const performance = await organizerService.getEventPerformance(req.user.id, parseInt(eventId));

    await auditService.logAction({
      userId: req.user.id,
      action: 'VIEW_EVENT_PERFORMANCE',
      resourceType: 'event',
      resourceId: parseInt(eventId),
      changes: { eventId: parseInt(eventId) }
    });

    res.json(performance);
  } catch (error) {
    console.error('Error fetching event performance:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/organizer/events
 * Get organizer's events with filters
 * @query {string} status - Filter by event status
 * @query {string} startDate - Filter by start date (ISO format)
 * @query {string} endDate - Filter by end date (ISO format)
 * @query {string} search - Search by event name or description
 * @query {number} limit - Pagination limit (default: 20)
 * @query {number} offset - Pagination offset (default: 0)
 */
router.get('/events', verifyToken, verifyOrganizerRole, async (req, res) => {
  try {
    const { status, startDate, endDate, search, limit = 20, offset = 0 } = req.query;

    // Validate pagination params
    const parsedLimit = Math.min(parseInt(limit) || 20, 100);
    const parsedOffset = parseInt(offset) || 0;

    const filters = {};
    if (status) filters.status = status;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    if (search) filters.search = search;

    const events = await organizerService.getOrganizerEvents(
      req.user.id,
      filters,
      parsedLimit,
      parsedOffset
    );

    await auditService.logAction({
      userId: req.user.id,
      action: 'VIEW_ORGANIZER_EVENTS',
      resourceType: 'organizer_dashboard',
      resourceId: req.user.id,
      changes: { filters, limit: parsedLimit, offset: parsedOffset }
    });

    res.json(events);
  } catch (error) {
    console.error('Error fetching organizer events:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/organizer/sales-trend
 * Get sales trend over time
 * @query {string} period - 'month' | 'year' | 'all' (default: 'month')
 */
router.get('/sales-trend', verifyToken, verifyOrganizerRole, async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    const validPeriods = ['month', 'year', 'all'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be: month, year, or all' });
    }

    const trend = await organizerService.getSalesTrend(req.user.id, period);

    await auditService.logAction({
      userId: req.user.id,
      action: 'VIEW_SALES_TREND',
      resourceType: 'organizer_dashboard',
      resourceId: req.user.id,
      changes: { period }
    });

    res.json({ data: trend, period });
  } catch (error) {
    console.error('Error fetching sales trend:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/organizer/refunds
 * Get refund summary
 * @query {string} period - 'month' | 'year' | 'all' (default: 'month')
 */
router.get('/refunds', verifyToken, verifyOrganizerRole, async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    const validPeriods = ['month', 'year', 'all'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be: month, year, or all' });
    }

    const refunds = await organizerService.getRefundSummary(req.user.id, period);

    await auditService.logAction({
      userId: req.user.id,
      action: 'VIEW_REFUND_SUMMARY',
      resourceType: 'organizer_dashboard',
      resourceId: req.user.id,
      changes: { period }
    });

    res.json(refunds);
  } catch (error) {
    console.error('Error fetching refund summary:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/organizer/customers
 * Get customer demographics and analytics
 * @query {string} period - 'month' | 'year' | 'all' (default: 'month')
 */
router.get('/customers', verifyToken, verifyOrganizerRole, async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    const validPeriods = ['month', 'year', 'all'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be: month, year, or all' });
    }

    const demographics = await organizerService.getCustomerDemographics(req.user.id, period);

    await auditService.logAction({
      userId: req.user.id,
      action: 'VIEW_CUSTOMER_DEMOGRAPHICS',
      resourceType: 'organizer_dashboard',
      resourceId: req.user.id,
      changes: { period }
    });

    res.json(demographics);
  } catch (error) {
    console.error('Error fetching customer demographics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/organizer/report
 * Generate comprehensive organizer report
 * @query {string} type - 'revenue' | 'attendance' | 'customers' | 'full' (default: 'full')
 * @query {string} period - 'month' | 'year' | 'all' (default: 'month')
 */
router.get('/report', verifyToken, verifyOrganizerRole, async (req, res) => {
  try {
    const { type = 'full', period = 'month' } = req.query;

    const validTypes = ['revenue', 'attendance', 'customers', 'full'];
    const validPeriods = ['month', 'year', 'all'];

    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid report type. Must be: revenue, attendance, customers, or full' });
    }

    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be: month, year, or all' });
    }

    const report = await organizerService.generateReport(req.user.id, type, period);

    await auditService.logAction({
      userId: req.user.id,
      action: 'GENERATE_ORGANIZER_REPORT',
      resourceType: 'organizer_dashboard',
      resourceId: req.user.id,
      changes: { reportType: type, period }
    });

    res.json(report);
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/organizer/report/export
 * Export organizer report as CSV
 * @query {string} type - 'revenue' | 'attendance' | 'customers' | 'full' (default: 'full')
 * @query {string} period - 'month' | 'year' | 'all' (default: 'month')
 */
router.get('/report/export', verifyToken, verifyOrganizerRole, async (req, res) => {
  try {
    const { type = 'full', period = 'month' } = req.query;

    const validTypes = ['revenue', 'attendance', 'customers', 'full'];
    const validPeriods = ['month', 'year', 'all'];

    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid report type. Must be: revenue, attendance, customers, or full' });
    }

    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be: month, year, or all' });
    }

    const report = await organizerService.generateReport(req.user.id, type, period);

    // Convert report to CSV format
    let csvContent = `Organizer Report - ${type.toUpperCase()}\n`;
    csvContent += `Generated: ${new Date().toISOString()}\n`;
    csvContent += `Period: ${period}\n\n`;

    // Add content based on report type
    if (report.data.overview) {
      csvContent += 'OVERVIEW\n';
      csvContent += `Total Events,Active Events,Total Revenue,Total Tickets Sold,Pending Orders\n`;
      csvContent += `${report.data.overview.totalEvents},${report.data.overview.activeEvents},${report.data.overview.totalRevenue},${report.data.overview.totalTicketsSold},${report.data.overview.pendingOrders}\n\n`;
    }

    if (report.data.revenueByEvent) {
      csvContent += 'REVENUE BY EVENT\n';
      csvContent += `Event Name,Tickets Sold,Total Revenue,Avg Order Value\n`;
      report.data.revenueByEvent.forEach(event => {
        csvContent += `"${event.eventName}",${event.ticketsSold},${event.totalRevenue},${event.avgOrderValue}\n`;
      });
      csvContent += '\n';
    }

    if (report.data.attendance) {
      csvContent += 'ATTENDANCE METRICS\n';
      csvContent += `Event Name,Capacity,Tickets Sold,Attended,Occupancy Rate,Attendance Rate\n`;
      report.data.attendance.forEach(event => {
        csvContent += `"${event.eventName}",${event.capacity},${event.ticketsSold},${event.attended},${event.occupancyRate}%,${event.attendanceRate}%\n`;
      });
      csvContent += '\n';
    }

    if (report.data.demographics) {
      csvContent += 'CUSTOMER DEMOGRAPHICS\n';
      csvContent += `Country,Customer Count,Tickets Sold,Total Spent\n`;
      report.data.demographics.byLocation.forEach(loc => {
        csvContent += `${loc.country},${loc.customerCount},${loc.ticketsSold},${loc.totalSpent}\n`;
      });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="organizer-report-${Date.now()}.csv"`);

    await auditService.logAction({
      userId: req.user.id,
      action: 'EXPORT_ORGANIZER_REPORT',
      resourceType: 'organizer_dashboard',
      resourceId: req.user.id,
      changes: { reportType: type, period, format: 'csv' }
    });

    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting report:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
