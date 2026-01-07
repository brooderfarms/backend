/**
 * Analytics Dashboard Service
 * Provides comprehensive analytics and reporting for the ticketing platform
 * Includes event analytics, revenue tracking, user behavior, and system metrics
 */

const db = require('../config/database');

class AnalyticsDashboardService {
  constructor() {
    this.db = db;
  }

  /**
   * Get overall platform statistics
   * @returns {Promise<Object>} Platform metrics
   */
  async getPlatformStats() {
    try {
      const totalUsers = await this.db('users').count('* as count').first();
      const totalEvents = await this.db('events').count('* as count').first();
      const totalTicketsSold = await this.db('tickets')
        .where('status', '!=', 'cancelled')
        .count('* as count')
        .first();
      const totalRevenue = await this.db('payments')
        .where('status', 'completed')
        .sum('amount as total')
        .first();

      const activeEvents = await this.db('events')
        .where('status', 'published')
        .where('start_date', '>', new Date())
        .count('* as count')
        .first();

      const totalVenues = await this.db('venues')
        .where('status', 'active')
        .count('* as count')
        .first();

      return {
        totalUsers: totalUsers?.count || 0,
        totalEvents: totalEvents?.count || 0,
        activeEvents: activeEvents?.count || 0,
        totalTicketsSold: totalTicketsSold?.count || 0,
        totalRevenue: totalRevenue?.total || 0,
        totalVenues: totalVenues?.count || 0
      };
    } catch (error) {
      console.error('Error fetching platform stats:', error);
      throw new Error(`Failed to fetch platform stats: ${error.message}`);
    }
  }

  /**
   * Get event analytics
   * @param {number} eventId - Event ID (optional, if null returns aggregated stats)
   * @returns {Promise<Object>} Event analytics
   */
  async getEventAnalytics(eventId = null) {
    try {
      let query = this.db('events');

      if (eventId) {
        query = query.where('id', eventId);
      }

      const events = await query.select(
        'id',
        'title',
        'base_price',
        'status',
        'start_date',
        'created_at'
      );

      const analytics = await Promise.all(
        events.map(async (event) => {
          const ticketStats = await this.db('tickets')
            .where('event_id', event.id)
            .select(
              this.db.raw('COUNT(*) as total_tickets'),
              this.db.raw("COUNT(CASE WHEN status = 'active' THEN 1 END) as active_tickets"),
              this.db.raw("COUNT(CASE WHEN status = 'scanned' THEN 1 END) as scanned_tickets"),
              this.db.raw("COUNT(CASE WHEN status = 'transferred' THEN 1 END) as transferred_tickets"),
              this.db.raw("COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded_tickets"),
              this.db.raw('SUM(price) as total_revenue')
            )
            .first();

          const attendanceRate = ticketStats.total_tickets > 0
            ? ((ticketStats.scanned_tickets / ticketStats.total_tickets) * 100).toFixed(2)
            : 0;

          const ratings = await this.db('events')
            .where('id', event.id)
            .select('average_rating', 'ratings_count')
            .first();

          return {
            eventId: event.id,
            title: event.title,
            basePrice: event.base_price,
            status: event.status,
            startDate: event.start_date,
            tickets: {
              total: ticketStats.total_tickets || 0,
              active: ticketStats.active_tickets || 0,
              scanned: ticketStats.scanned_tickets || 0,
              transferred: ticketStats.transferred_tickets || 0,
              refunded: ticketStats.refunded_tickets || 0,
              attendanceRate: parseFloat(attendanceRate)
            },
            revenue: ticketStats.total_revenue || 0,
            ratings: {
              average: ratings.average_rating || 0,
              count: ratings.ratings_count || 0
            }
          };
        })
      );

      return eventId ? analytics[0] : analytics;
    } catch (error) {
      console.error('Error fetching event analytics:', error);
      throw new Error(`Failed to fetch event analytics: ${error.message}`);
    }
  }

  /**
   * Get revenue analytics
   * @param {number} days - Number of days to analyze (default: 30)
   * @returns {Promise<Object>} Revenue metrics
   */
  async getRevenueAnalytics(days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const dailyRevenue = await this.db('payments')
        .select(
          this.db.raw('DATE(created_at) as date'),
          this.db.raw('COUNT(*) as transaction_count'),
          this.db.raw('SUM(amount) as daily_total'),
          this.db.raw("COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed"),
          this.db.raw("COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending"),
          this.db.raw("COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed")
        )
        .where('created_at', '>', startDate)
        .groupBy(this.db.raw('DATE(created_at)'))
        .orderBy('date', 'asc');

      const byPaymentMethod = await this.db('payments')
        .select(
          'payment_method',
          this.db.raw('COUNT(*) as count'),
          this.db.raw('SUM(amount) as total')
        )
        .where('status', 'completed')
        .where('created_at', '>', startDate)
        .groupBy('payment_method');

      const byCurrency = await this.db('payments')
        .select(
          'currency',
          this.db.raw('COUNT(*) as count'),
          this.db.raw('SUM(amount) as total')
        )
        .where('status', 'completed')
        .where('created_at', '>', startDate)
        .groupBy('currency');

      const totalRevenue = await this.db('payments')
        .where('status', 'completed')
        .where('created_at', '>', startDate)
        .sum('amount as total')
        .first();

      const avgTransactionValue = await this.db('payments')
        .where('status', 'completed')
        .where('created_at', '>', startDate)
        .avg('amount as average')
        .first();

      return {
        period: { days, startDate },
        dailyRevenue,
        byPaymentMethod,
        byCurrency,
        totalRevenue: totalRevenue?.total || 0,
        avgTransactionValue: avgTransactionValue?.average || 0,
        transactionCount: dailyRevenue.reduce((sum, d) => sum + d.transaction_count, 0)
      };
    } catch (error) {
      console.error('Error fetching revenue analytics:', error);
      throw new Error(`Failed to fetch revenue analytics: ${error.message}`);
    }
  }

  /**
   * Get user behavior analytics
   * @param {number} days - Number of days to analyze (default: 30)
   * @returns {Promise<Object>} User behavior metrics
   */
  async getUserBehaviorAnalytics(days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const newUsers = await this.db('users')
        .where('created_at', '>', startDate)
        .count('* as count')
        .first();

      const activeUsers = await this.db('audit_logs')
        .distinct('user_id')
        .where('created_at', '>', startDate)
        .count('* as count')
        .first();

      const ticketPurchases = await this.db('tickets')
        .where('created_at', '>', startDate)
        .count('* as count')
        .first();

      const avgTicketsPerUser = await this.db('tickets')
        .select(this.db.raw('AVG(ticket_count) as average'))
        .from(
          this.db('tickets')
            .select('user_id', this.db.raw('COUNT(*) as ticket_count'))
            .where('created_at', '>', startDate)
            .where('status', '!=', 'cancelled')
            .groupBy('user_id')
            .as('user_tickets')
        )
        .first();

      const usersByRole = await this.db('users')
        .select('role', this.db.raw('COUNT(*) as count'))
        .groupBy('role');

      const topEvents = await this.db('tickets')
        .select(
          'events.id',
          'events.title',
          this.db.raw('COUNT(tickets.id) as ticket_count')
        )
        .join('events', 'tickets.event_id', '=', 'events.id')
        .where('tickets.created_at', '>', startDate)
        .where('tickets.status', '!=', 'cancelled')
        .groupBy('events.id', 'events.title')
        .orderBy('ticket_count', 'desc')
        .limit(10);

      return {
        period: { days, startDate },
        newUsers: newUsers?.count || 0,
        activeUsers: activeUsers?.count || 0,
        ticketPurchases: ticketPurchases?.count || 0,
        avgTicketsPerUser: avgTicketsPerUser?.average || 0,
        usersByRole,
        topEvents
      };
    } catch (error) {
      console.error('Error fetching user behavior analytics:', error);
      throw new Error(`Failed to fetch user behavior analytics: ${error.message}`);
    }
  }

  /**
   * Get venue analytics
   * @returns {Promise<Array>} Venue performance metrics
   */
  async getVenueAnalytics() {
    try {
      const venues = await this.db('venues')
        .select('id', 'name', 'capacity', 'average_rating')
        .where('status', 'active');

      const venueStats = await Promise.all(
        venues.map(async (venue) => {
          const events = await this.db('events')
            .where('venue_id', venue.id)
            .count('* as count')
            .first();

          const ticketsSold = await this.db('tickets')
            .join('events', 'tickets.event_id', '=', 'events.id')
            .where('events.venue_id', venue.id)
            .where('tickets.status', '!=', 'cancelled')
            .count('* as count')
            .first();

          const revenue = await this.db('payments')
            .join('tickets', 'payments.ticket_id', '=', 'tickets.id')
            .join('events', 'tickets.event_id', '=', 'events.id')
            .where('events.venue_id', venue.id)
            .where('payments.status', 'completed')
            .sum('payments.amount as total')
            .first();

          const utilization = venue.capacity > 0
            ? ((ticketsSold.count / (events.count * venue.capacity)) * 100).toFixed(2)
            : 0;

          return {
            venueId: venue.id,
            name: venue.name,
            capacity: venue.capacity,
            events: events.count || 0,
            ticketsSold: ticketsSold.count || 0,
            revenue: revenue?.total || 0,
            utilization: parseFloat(utilization),
            rating: venue.average_rating || 0
          };
        })
      );

      return venueStats;
    } catch (error) {
      console.error('Error fetching venue analytics:', error);
      throw new Error(`Failed to fetch venue analytics: ${error.message}`);
    }
  }

  /**
   * Get ticket sales analytics
   * @param {number} days - Number of days to analyze
   * @returns {Promise<Object>} Ticket sales metrics
   */
  async getTicketSalesAnalytics(days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const dailySales = await this.db('tickets')
        .select(
          this.db.raw('DATE(created_at) as date'),
          this.db.raw('COUNT(*) as tickets_sold'),
          this.db.raw('SUM(price) as revenue')
        )
        .where('created_at', '>', startDate)
        .where('status', '!=', 'cancelled')
        .groupBy(this.db.raw('DATE(created_at)'))
        .orderBy('date', 'asc');

      const bySeatType = await this.db('tickets')
        .select(
          'seat_type',
          this.db.raw('COUNT(*) as count'),
          this.db.raw('SUM(price) as total'),
          this.db.raw('AVG(price) as average')
        )
        .where('created_at', '>', startDate)
        .where('status', '!=', 'cancelled')
        .groupBy('seat_type');

      const refunds = await this.db('tickets')
        .where('status', 'refunded')
        .where('created_at', '>', startDate)
        .count('* as count')
        .first();

      const transfers = await this.db('ticket_transfers')
        .where('created_at', '>', startDate)
        .count('* as count')
        .first();

      const totalTickets = await this.db('tickets')
        .where('created_at', '>', startDate)
        .where('status', '!=', 'cancelled')
        .count('* as count')
        .first();

      const totalSales = await this.db('tickets')
        .where('created_at', '>', startDate)
        .where('status', '!=', 'cancelled')
        .sum('price as total')
        .first();

      return {
        period: { days, startDate },
        dailySales,
        bySeatType,
        refunds: refunds?.count || 0,
        transfers: transfers?.count || 0,
        totalTickets: totalTickets?.count || 0,
        totalSales: totalSales?.total || 0
      };
    } catch (error) {
      console.error('Error fetching ticket sales analytics:', error);
      throw new Error(`Failed to fetch ticket sales analytics: ${error.message}`);
    }
  }

  /**
   * Get system health metrics
   * @returns {Promise<Object>} System health indicators
   */
  async getSystemHealth() {
    try {
      // Pending payments
      const pendingPayments = await this.db('payments')
        .where('status', 'pending')
        .count('* as count')
        .first();

      // Failed payments
      const failedPayments = await this.db('payments')
        .where('status', 'failed')
        .count('* as count')
        .first();

      // Pending refunds
      const pendingRefunds = await this.db('ticket_refunds')
        .where('status', 'pending')
        .count('* as count')
        .first();

      // Unsent emails
      const unsentEmails = await this.db('email_queue')
        .where('sent_at', null)
        .count('* as count')
        .first()
        .catch(() => ({ count: 0 }));

      // Recent errors (from audit logs)
      const recentErrors = await this.db('audit_logs')
        .where('action', 'like', '%ERROR%')
        .where('created_at', '>', this.db.raw("DATE_SUB(NOW(), INTERVAL 24 HOUR)"))
        .count('* as count')
        .first();

      const health = {
        status: 'healthy',
        indicators: {
          pendingPayments: pendingPayments?.count || 0,
          failedPayments: failedPayments?.count || 0,
          pendingRefunds: pendingRefunds?.count || 0,
          unsentEmails: unsentEmails?.count || 0,
          recentErrors: recentErrors?.count || 0
        },
        timestamp: new Date()
      };

      // Determine overall health
      if (health.indicators.failedPayments > 10 || health.indicators.pendingRefunds > 50) {
        health.status = 'warning';
      } else if (health.indicators.failedPayments > 50 || health.indicators.pendingRefunds > 100) {
        health.status = 'critical';
      }

      return health;
    } catch (error) {
      console.error('Error fetching system health:', error);
      throw new Error(`Failed to fetch system health: ${error.message}`);
    }
  }

  /**
   * Get comprehensive dashboard data
   * @returns {Promise<Object>} All dashboard metrics
   */
  async getComprehensiveDashboard() {
    try {
      const [
        platformStats,
        eventAnalytics,
        revenueAnalytics,
        userBehavior,
        venueAnalytics,
        ticketSales,
        systemHealth
      ] = await Promise.all([
        this.getPlatformStats(),
        this.getEventAnalytics(),
        this.getRevenueAnalytics(30),
        this.getUserBehaviorAnalytics(30),
        this.getVenueAnalytics(),
        this.getTicketSalesAnalytics(30),
        this.getSystemHealth()
      ]);

      return {
        platformStats,
        eventAnalytics,
        revenueAnalytics,
        userBehavior,
        venueAnalytics,
        ticketSales,
        systemHealth,
        generatedAt: new Date()
      };
    } catch (error) {
      console.error('Error generating comprehensive dashboard:', error);
      throw new Error(`Failed to generate dashboard: ${error.message}`);
    }
  }
}

module.exports = new AnalyticsDashboardService();
