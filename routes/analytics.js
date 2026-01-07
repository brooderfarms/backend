const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const analyticsDashboardService = require('../services/analyticsDashboardService');

// Middleware to check for admin role
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can access analytics' });
  }
  next();
};

/**
 * GET /api/analytics/platform
 * Get overall platform statistics
 */
router.get('/platform', verifyToken, adminOnly, async (req, res) => {
  try {
    const stats = await analyticsDashboardService.getPlatformStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching platform stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/analytics/events
 * Get event analytics
 * @query {number} eventId - Specific event ID (optional)
 */
router.get('/events', verifyToken, adminOnly, async (req, res) => {
  try {
    const { eventId } = req.query;
    const analytics = await analyticsDashboardService.getEventAnalytics(
      eventId ? parseInt(eventId) : null
    );
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching event analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/analytics/events/:eventId
 * Get analytics for a specific event
 */
router.get('/events/:eventId', verifyToken, adminOnly, async (req, res) => {
  try {
    const { eventId } = req.params;

    if (isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    const analytics = await analyticsDashboardService.getEventAnalytics(parseInt(eventId));

    if (!analytics) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(analytics);
  } catch (error) {
    console.error('Error fetching event analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/analytics/revenue
 * Get revenue analytics
 * @query {number} days - Number of days to analyze (default: 30)
 */
router.get('/revenue', verifyToken, adminOnly, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const analytics = await analyticsDashboardService.getRevenueAnalytics(parseInt(days) || 30);
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching revenue analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/analytics/users
 * Get user behavior analytics
 * @query {number} days - Number of days to analyze (default: 30)
 */
router.get('/users', verifyToken, adminOnly, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const analytics = await analyticsDashboardService.getUserBehaviorAnalytics(
      parseInt(days) || 30
    );
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching user behavior analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/analytics/venues
 * Get venue analytics
 */
router.get('/venues', verifyToken, adminOnly, async (req, res) => {
  try {
    const analytics = await analyticsDashboardService.getVenueAnalytics();
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching venue analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/analytics/tickets
 * Get ticket sales analytics
 * @query {number} days - Number of days to analyze (default: 30)
 */
router.get('/tickets', verifyToken, adminOnly, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const analytics = await analyticsDashboardService.getTicketSalesAnalytics(
      parseInt(days) || 30
    );
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching ticket sales analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/analytics/health
 * Get system health metrics
 */
router.get('/health', verifyToken, adminOnly, async (req, res) => {
  try {
    const health = await analyticsDashboardService.getSystemHealth();
    res.json(health);
  } catch (error) {
    console.error('Error fetching system health:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/analytics/dashboard
 * Get comprehensive dashboard with all analytics
 */
router.get('/dashboard', verifyToken, adminOnly, async (req, res) => {
  try {
    const dashboard = await analyticsDashboardService.getComprehensiveDashboard();
    res.json(dashboard);
  } catch (error) {
    console.error('Error fetching comprehensive dashboard:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
