const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { verifyToken } = require('../middleware/auth');
const venueManagerService = require('../services/venueManagerService');
const auditService = require('../services/auditService');
const db = require('../config/database');

/**
 * Middleware to verify venue manager access
 */
const verifyVenueManagerAccess = async (req, res, next) => {
  try {
    if (req.user.role !== 'venue_manager' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Venue manager access required' });
    }

    // For non-admins, verify they manage the requested venue
    if (req.user.role === 'venue_manager' && req.params.venueId) {
      const venueId = parseInt(req.params.venueId);
      const userVenue = await db('venues')
        .where('id', venueId)
        .where('manager_id', req.user.id)
        .where('deleted_at', null)
        .first();

      if (!userVenue) {
        return res.status(403).json({ error: 'Unauthorized: You do not manage this venue' });
      }
    }

    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/venue-manager/venues/:venueId/dashboard
 * Get venue dashboard overview
 * @param {number} venueId - Venue ID
 * @query {string} period - 'month' | 'year' | 'all' (default: 'month')
 */
router.get('/venues/:venueId/dashboard', verifyToken, verifyVenueManagerAccess, async (req, res) => {
  try {
    const { venueId } = req.params;
    const { period = 'month' } = req.query;

    if (isNaN(venueId)) {
      return res.status(400).json({ error: 'Invalid venue ID' });
    }

    const validPeriods = ['month', 'year', 'all'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be: month, year, or all' });
    }

    const overview = await venueManagerService.getDashboardOverview(parseInt(venueId), period);

    await auditService.logAction({
      userId: req.user.id,
      action: 'VIEW_VENUE_DASHBOARD',
      resourceType: 'venue',
      resourceId: parseInt(venueId),
      changes: { period }
    });

    res.json(overview);
  } catch (error) {
    console.error('Error fetching venue dashboard:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/venue-manager/venues/:venueId/calendar
 * Get venue event calendar with occupancy
 * @param {number} venueId - Venue ID
 * @query {string} startDate - Start date (ISO format, required)
 * @query {string} endDate - End date (ISO format, required)
 */
router.get('/venues/:venueId/calendar', verifyToken, verifyVenueManagerAccess, async (req, res) => {
  try {
    const { venueId } = req.params;
    const { startDate, endDate } = req.query;

    if (isNaN(venueId)) {
      return res.status(400).json({ error: 'Invalid venue ID' });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const calendar = await venueManagerService.getEventCalendar(
      parseInt(venueId),
      startDate,
      endDate
    );

    await auditService.logAction({
      userId: req.user.id,
      action: 'VIEW_VENUE_CALENDAR',
      resourceType: 'venue',
      resourceId: parseInt(venueId),
      changes: { startDate, endDate }
    });

    res.json({ data: calendar });
  } catch (error) {
    console.error('Error fetching event calendar:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/venue-manager/venues/:venueId/occupancy
 * Get occupancy metrics by event
 * @param {number} venueId - Venue ID
 * @query {string} period - 'month' | 'year' | 'all' (default: 'month')
 */
router.get('/venues/:venueId/occupancy', verifyToken, verifyVenueManagerAccess, async (req, res) => {
  try {
    const { venueId } = req.params;
    const { period = 'month' } = req.query;

    if (isNaN(venueId)) {
      return res.status(400).json({ error: 'Invalid venue ID' });
    }

    const validPeriods = ['month', 'year', 'all'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be: month, year, or all' });
    }

    const occupancy = await venueManagerService.getOccupancyByEvent(parseInt(venueId), period);

    await auditService.logAction({
      userId: req.user.id,
      action: 'VIEW_OCCUPANCY_METRICS',
      resourceType: 'venue',
      resourceId: parseInt(venueId),
      changes: { period }
    });

    res.json({ data: occupancy, period });
  } catch (error) {
    console.error('Error fetching occupancy metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/venue-manager/venues/:venueId/events/:eventId/seats
 * Get seat availability for an event
 * @param {number} venueId - Venue ID
 * @param {number} eventId - Event ID
 */
router.get('/venues/:venueId/events/:eventId/seats', verifyToken, verifyVenueManagerAccess, async (req, res) => {
  try {
    const { venueId, eventId } = req.params;

    if (isNaN(venueId) || isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid venue or event ID' });
    }

    const seatAvailability = await venueManagerService.getEventSeatAvailability(
      parseInt(venueId),
      parseInt(eventId)
    );

    await auditService.logAction({
      userId: req.user.id,
      action: 'VIEW_EVENT_SEATS',
      resourceType: 'event',
      resourceId: parseInt(eventId),
      changes: { venueId: parseInt(venueId) }
    });

    res.json(seatAvailability);
  } catch (error) {
    console.error('Error fetching seat availability:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/venue-manager/venues/:venueId/alerts
 * Get capacity alerts for venue
 * @param {number} venueId - Venue ID
 * @query {number} threshold - Alert threshold percentage (default: 80)
 */
router.get('/venues/:venueId/alerts', verifyToken, verifyVenueManagerAccess, async (req, res) => {
  try {
    const { venueId } = req.params;
    const { threshold = 80 } = req.query;

    if (isNaN(venueId)) {
      return res.status(400).json({ error: 'Invalid venue ID' });
    }

    const thresholdNum = parseInt(threshold);
    if (isNaN(thresholdNum) || thresholdNum < 0 || thresholdNum > 100) {
      return res.status(400).json({ error: 'Threshold must be a number between 0 and 100' });
    }

    const alerts = await venueManagerService.getCapacityAlerts(parseInt(venueId), thresholdNum);

    await auditService.logAction({
      userId: req.user.id,
      action: 'VIEW_CAPACITY_ALERTS',
      resourceType: 'venue',
      resourceId: parseInt(venueId),
      changes: { threshold: thresholdNum }
    });

    res.json({ data: alerts, threshold: thresholdNum });
  } catch (error) {
    console.error('Error fetching capacity alerts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/venue-manager/venues/:venueId/utilization
 * Get venue utilization report
 * @param {number} venueId - Venue ID
 * @query {string} period - 'month' | 'year' | 'all' (default: 'month')
 */
router.get('/venues/:venueId/utilization', verifyToken, verifyVenueManagerAccess, async (req, res) => {
  try {
    const { venueId } = req.params;
    const { period = 'month' } = req.query;

    if (isNaN(venueId)) {
      return res.status(400).json({ error: 'Invalid venue ID' });
    }

    const validPeriods = ['month', 'year', 'all'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be: month, year, or all' });
    }

    const utilization = await venueManagerService.getUtilizationReport(parseInt(venueId), period);

    await auditService.logAction({
      userId: req.user.id,
      action: 'VIEW_UTILIZATION_REPORT',
      resourceType: 'venue',
      resourceId: parseInt(venueId),
      changes: { period }
    });

    res.json(utilization);
  } catch (error) {
    console.error('Error fetching utilization report:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/venue-manager/venues/:venueId/upcoming
 * Get upcoming event alerts and notifications
 * @param {number} venueId - Venue ID
 * @query {number} days - Number of days to look ahead (default: 7)
 */
router.get('/venues/:venueId/upcoming', verifyToken, verifyVenueManagerAccess, async (req, res) => {
  try {
    const { venueId } = req.params;
    const { days = 7 } = req.query;

    if (isNaN(venueId)) {
      return res.status(400).json({ error: 'Invalid venue ID' });
    }

    const daysNum = parseInt(days);
    if (isNaN(daysNum) || daysNum < 1) {
      return res.status(400).json({ error: 'Days must be a positive number' });
    }

    const alerts = await venueManagerService.getUpcomingAlerts(parseInt(venueId), daysNum);

    await auditService.logAction({
      userId: req.user.id,
      action: 'VIEW_UPCOMING_ALERTS',
      resourceType: 'venue',
      resourceId: parseInt(venueId),
      changes: { days: daysNum }
    });

    res.json({ data: alerts, daysAhead: daysNum });
  } catch (error) {
    console.error('Error fetching upcoming alerts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/venue-manager/venues/:venueId/details
 * Get detailed venue information
 * @param {number} venueId - Venue ID
 */
router.get('/venues/:venueId/details', verifyToken, verifyVenueManagerAccess, async (req, res) => {
  try {
    const { venueId } = req.params;

    if (isNaN(venueId)) {
      return res.status(400).json({ error: 'Invalid venue ID' });
    }

    const details = await venueManagerService.getVenueDetails(parseInt(venueId));

    await auditService.logAction({
      userId: req.user.id,
      action: 'VIEW_VENUE_DETAILS',
      resourceType: 'venue',
      resourceId: parseInt(venueId),
      changes: {}
    });

    res.json(details);
  } catch (error) {
    console.error('Error fetching venue details:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/venue-manager/venues/:venueId/report
 * Generate comprehensive venue manager report
 * @param {number} venueId - Venue ID
 * @query {string} type - 'occupancy' | 'events' | 'utilization' | 'full' (default: 'full')
 * @query {string} period - 'month' | 'year' | 'all' (default: 'month')
 */
router.get('/venues/:venueId/report', verifyToken, verifyVenueManagerAccess, async (req, res) => {
  try {
    const { venueId } = req.params;
    const { type = 'full', period = 'month' } = req.query;

    if (isNaN(venueId)) {
      return res.status(400).json({ error: 'Invalid venue ID' });
    }

    const validTypes = ['occupancy', 'events', 'utilization', 'full'];
    const validPeriods = ['month', 'year', 'all'];

    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid report type. Must be: occupancy, events, utilization, or full' });
    }

    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be: month, year, or all' });
    }

    const report = await venueManagerService.generateReport(parseInt(venueId), type, period);

    await auditService.logAction({
      userId: req.user.id,
      action: 'GENERATE_VENUE_REPORT',
      resourceType: 'venue',
      resourceId: parseInt(venueId),
      changes: { reportType: type, period }
    });

    res.json(report);
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/venue-manager/venues/:venueId/report/export
 * Export venue report as CSV
 * @param {number} venueId - Venue ID
 * @query {string} type - 'occupancy' | 'events' | 'utilization' | 'full' (default: 'full')
 * @query {string} period - 'month' | 'year' | 'all' (default: 'month')
 */
router.get('/venues/:venueId/report/export', verifyToken, verifyVenueManagerAccess, async (req, res) => {
  try {
    const { venueId } = req.params;
    const { type = 'full', period = 'month' } = req.query;

    if (isNaN(venueId)) {
      return res.status(400).json({ error: 'Invalid venue ID' });
    }

    const validTypes = ['occupancy', 'events', 'utilization', 'full'];
    const validPeriods = ['month', 'year', 'all'];

    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid report type. Must be: occupancy, events, utilization, or full' });
    }

    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be: month, year, or all' });
    }

    const report = await venueManagerService.generateReport(parseInt(venueId), type, period);

    // Convert report to CSV
    let csvContent = `Venue Manager Report - ${type.toUpperCase()}\n`;
    csvContent += `Generated: ${new Date().toISOString()}\n`;
    csvContent += `Period: ${period}\n\n`;

    if (report.data.overview) {
      csvContent += 'VENUE OVERVIEW\n';
      csvContent += `Venue Name,Capacity,Scheduled Events,Upcoming Events,Current Occupancy,Occupancy %\n`;
      csvContent += `"${report.data.overview.venueName}",${report.data.overview.capacity},${report.data.overview.scheduledEvents},${report.data.overview.upcomingEvents},${report.data.overview.currentOccupancy},${report.data.overview.occupancyPercentage}%\n\n`;
    }

    if (report.data.occupancyByEvent) {
      csvContent += 'OCCUPANCY BY EVENT\n';
      csvContent += `Event Name,Date,Capacity,Occupancy Rate,Status\n`;
      report.data.occupancyByEvent.forEach(event => {
        csvContent += `"${event.eventName}",${event.eventDate},${event.capacity},${event.occupancyRate}%,${event.status}\n`;
      });
      csvContent += '\n';
    }

    if (report.data.upcomingEvents) {
      csvContent += 'UPCOMING EVENTS\n';
      csvContent += `Event Name,Date,Capacity,Current Attendance,Occupancy Rate,Status\n`;
      report.data.upcomingEvents.forEach(event => {
        csvContent += `"${event.eventName}",${event.eventDate},${event.capacity},${event.currentAttendance},${event.occupancyRate}%,${event.status}\n`;
      });
      csvContent += '\n';
    }

    if (report.data.utilization) {
      csvContent += 'UTILIZATION METRICS\n';
      csvContent += `Metric,Value\n`;
      csvContent += `Average Occupancy,${report.data.utilization.occupancy.average}%\n`;
      csvContent += `Max Occupancy,${report.data.utilization.occupancy.max}%\n`;
      csvContent += `Min Occupancy,${report.data.utilization.occupancy.min}%\n`;
      csvContent += `Total Events,${report.data.utilization.occupancy.totalEvents}\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="venue-report-${Date.now()}.csv"`);

    await auditService.logAction({
      userId: req.user.id,
      action: 'EXPORT_VENUE_REPORT',
      resourceType: 'venue',
      resourceId: parseInt(venueId),
      changes: { reportType: type, period, format: 'csv' }
    });

    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting report:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
