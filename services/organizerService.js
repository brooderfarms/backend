const db = require('../config/database');
const { startOfMonth, endOfMonth, startOfYear, endOfYear } = require('date-fns');

class OrganizerService {
  /**
   * Get organizer dashboard overview
   * @param {number} organizerId - User ID of organizer
   * @param {string} period - 'month' | 'year' | 'all'
   */
  async getDashboardOverview(organizerId, period = 'month') {
    try {
      const dateRange = this._getDateRange(period);

      // Get total events
      const eventsResult = await db('events')
        .where('organizer_id', organizerId)
        .where('deleted_at', null)
        .count('id as total');

      // Get active events (published and approved)
      const activeEventsResult = await db('events')
        .where('organizer_id', organizerId)
        .where('status', 'approved')
        .where('deleted_at', null)
        .count('id as total');

      // Get total revenue
      const revenueResult = await db('orders')
        .join('event_tickets', 'orders.id', 'event_tickets.order_id')
        .join('events', 'event_tickets.event_id', 'events.id')
        .where('events.organizer_id', organizerId)
        .where('orders.status', 'completed')
        .where('orders.created_at', '>=', dateRange.start)
        .where('orders.created_at', '<=', dateRange.end)
        .where('orders.deleted_at', null)
        .sum('orders.total_amount as revenue');

      // Get total tickets sold
      const ticketsResult = await db('event_tickets')
        .join('events', 'event_tickets.event_id', 'events.id')
        .join('orders', 'event_tickets.order_id', 'orders.id')
        .where('events.organizer_id', organizerId)
        .where('orders.status', 'completed')
        .where('orders.created_at', '>=', dateRange.start)
        .where('orders.created_at', '<=', dateRange.end)
        .where('orders.deleted_at', null)
        .count('event_tickets.id as total');

      // Get pending orders
      const pendingResult = await db('orders')
        .join('event_tickets', 'orders.id', 'event_tickets.order_id')
        .join('events', 'event_tickets.event_id', 'events.id')
        .where('events.organizer_id', organizerId)
        .where('orders.status', 'pending')
        .where('orders.deleted_at', null)
        .count('orders.id as total');

      return {
        totalEvents: eventsResult[0]?.total || 0,
        activeEvents: activeEventsResult[0]?.total || 0,
        totalRevenue: parseFloat(revenueResult[0]?.revenue || 0),
        totalTicketsSold: ticketsResult[0]?.total || 0,
        pendingOrders: pendingResult[0]?.total || 0,
        period
      };
    } catch (error) {
      throw new Error(`Failed to get dashboard overview: ${error.message}`);
    }
  }

  /**
   * Get revenue metrics by event
   * @param {number} organizerId - User ID of organizer
   * @param {string} period - 'month' | 'year' | 'all'
   */
  async getRevenueByEvent(organizerId, period = 'month') {
    try {
      const dateRange = this._getDateRange(period);

      const results = await db('events')
        .select(
          'events.id',
          'events.name',
          'events.event_date',
          'events.status',
          db.raw('COUNT(DISTINCT event_tickets.id) as tickets_sold'),
          db.raw('SUM(orders.total_amount) as total_revenue'),
          db.raw('AVG(orders.total_amount) as avg_order_value')
        )
        .leftJoin('event_tickets', 'events.id', 'event_tickets.event_id')
        .leftJoin('orders', 'event_tickets.order_id', 'orders.id')
        .where('events.organizer_id', organizerId)
        .where('events.deleted_at', null)
        .where('orders.status', 'completed')
        .where('orders.created_at', '>=', dateRange.start)
        .where('orders.created_at', '<=', dateRange.end)
        .orWhere(qb => {
          qb.where('events.organizer_id', organizerId)
            .where('events.deleted_at', null)
            .where('orders.id', null);
        })
        .groupBy('events.id', 'events.name', 'events.event_date', 'events.status')
        .orderBy('total_revenue', 'desc');

      return results.map(row => ({
        eventId: row.id,
        eventName: row.name,
        eventDate: row.event_date,
        status: row.status,
        ticketsSold: row.tickets_sold || 0,
        totalRevenue: parseFloat(row.total_revenue || 0),
        avgOrderValue: parseFloat(row.avg_order_value || 0)
      }));
    } catch (error) {
      throw new Error(`Failed to get revenue by event: ${error.message}`);
    }
  }

  /**
   * Get attendance metrics
   * @param {number} organizerId - User ID of organizer
   * @param {string} period - 'month' | 'year' | 'all'
   */
  async getAttendanceMetrics(organizerId, period = 'month') {
    try {
      const dateRange = this._getDateRange(period);

      const results = await db('events')
        .select(
          'events.id',
          'events.name',
          'events.capacity',
          'events.event_date',
          db.raw('COUNT(DISTINCT event_tickets.id) as tickets_used'),
          db.raw('COUNT(CASE WHEN event_tickets.status = \'used\' THEN 1 END) as attended'),
          db.raw('COUNT(CASE WHEN event_tickets.status = \'reserved\' THEN 1 END) as reserved'),
          db.raw('COUNT(CASE WHEN event_tickets.status = \'cancelled\' THEN 1 END) as cancelled')
        )
        .leftJoin('event_tickets', 'events.id', 'event_tickets.event_id')
        .where('events.organizer_id', organizerId)
        .where('events.deleted_at', null)
        .where('events.event_date', '>=', dateRange.start)
        .where('events.event_date', '<=', dateRange.end)
        .groupBy('events.id', 'events.name', 'events.capacity', 'events.event_date')
        .orderBy('events.event_date', 'desc');

      return results.map(row => ({
        eventId: row.id,
        eventName: row.name,
        capacity: row.capacity,
        eventDate: row.event_date,
        ticketsSold: row.tickets_used || 0,
        attended: row.attended || 0,
        reserved: row.reserved || 0,
        cancelled: row.cancelled || 0,
        occupancyRate: row.capacity ? ((row.tickets_used || 0) / row.capacity * 100).toFixed(2) : 0,
        attendanceRate: row.tickets_used ? ((row.attended || 0) / (row.tickets_used || 0) * 100).toFixed(2) : 0
      }));
    } catch (error) {
      throw new Error(`Failed to get attendance metrics: ${error.message}`);
    }
  }

  /**
   * Get event performance analytics
   * @param {number} organizerId - User ID of organizer
   * @param {number} eventId - Event ID
   */
  async getEventPerformance(organizerId, eventId) {
    try {
      // Verify ownership
      const event = await db('events')
        .where('id', eventId)
        .where('organizer_id', organizerId)
        .where('deleted_at', null)
        .first();

      if (!event) {
        throw new Error('Event not found or unauthorized');
      }

      // Get ticket breakdown by pricing tier
      const ticketsByTier = await db('event_tickets')
        .select('pricing_tier', db.raw('COUNT(*) as count'))
        .where('event_id', eventId)
        .groupBy('pricing_tier');

      // Get sales by date
      const salesByDate = await db('event_tickets')
        .select(
          db.raw('DATE(orders.created_at) as date'),
          db.raw('COUNT(*) as tickets_sold'),
          db.raw('SUM(orders.total_amount) as revenue')
        )
        .join('orders', 'event_tickets.order_id', 'orders.id')
        .where('event_tickets.event_id', eventId)
        .where('orders.status', 'completed')
        .groupBy(db.raw('DATE(orders.created_at)'))
        .orderBy('date', 'asc');

      // Get top customers by spending
      const topCustomers = await db('event_tickets')
        .select(
          'users.id',
          'users.first_name',
          'users.last_name',
          'users.email',
          db.raw('COUNT(*) as tickets_purchased'),
          db.raw('SUM(orders.total_amount) as total_spent')
        )
        .join('orders', 'event_tickets.order_id', 'orders.id')
        .join('users', 'orders.user_id', 'users.id')
        .where('event_tickets.event_id', eventId)
        .where('orders.status', 'completed')
        .groupBy('users.id', 'users.first_name', 'users.last_name', 'users.email')
        .orderBy('total_spent', 'desc')
        .limit(10);

      // Get refund information
      const refundInfo = await db('event_tickets')
        .select(
          db.raw('COUNT(CASE WHEN status = \'cancelled\' THEN 1 END) as cancelled_tickets'),
          db.raw('SUM(CASE WHEN status = \'cancelled\' THEN refund_amount ELSE 0 END) as total_refunded')
        )
        .where('event_id', eventId)
        .first();

      return {
        eventId,
        eventName: event.name,
        eventDate: event.event_date,
        capacity: event.capacity,
        ticketsByTier: ticketsByTier.map(row => ({
          tier: row.pricing_tier,
          count: row.count
        })),
        salesByDate: salesByDate.map(row => ({
          date: row.date,
          ticketsSold: row.tickets_sold,
          revenue: parseFloat(row.revenue || 0)
        })),
        topCustomers: topCustomers.map(row => ({
          customerId: row.id,
          customerName: `${row.first_name} ${row.last_name}`,
          email: row.email,
          ticketsPurchased: row.tickets_purchased,
          totalSpent: parseFloat(row.total_spent)
        })),
        refunds: {
          cancelledTickets: refundInfo?.cancelled_tickets || 0,
          totalRefunded: parseFloat(refundInfo?.total_refunded || 0)
        }
      };
    } catch (error) {
      throw new Error(`Failed to get event performance: ${error.message}`);
    }
  }

  /**
   * Get organizer's events list with filters
   * @param {number} organizerId - User ID of organizer
   * @param {object} filters - { status, startDate, endDate, search }
   * @param {number} limit - Pagination limit
   * @param {number} offset - Pagination offset
   */
  async getOrganizerEvents(organizerId, filters = {}, limit = 20, offset = 0) {
    try {
      let query = db('events')
        .where('organizer_id', organizerId)
        .where('deleted_at', null);

      // Apply filters
      if (filters.status) {
        query.where('status', filters.status);
      }

      if (filters.startDate) {
        query.where('event_date', '>=', filters.startDate);
      }

      if (filters.endDate) {
        query.where('event_date', '<=', filters.endDate);
      }

      if (filters.search) {
        query.where('name', 'ilike', `%${filters.search}%`)
          .orWhere('description', 'ilike', `%${filters.search}%`);
      }

      const total = await query.clone().count('id as count').first();

      const events = await query
        .select(
          'events.id',
          'events.name',
          'events.description',
          'events.event_date',
          'events.venue_id',
          'events.capacity',
          'events.status',
          'events.ticket_price',
          'events.created_at',
          'venues.name as venue_name'
        )
        .leftJoin('venues', 'events.venue_id', 'venues.id')
        .orderBy('events.event_date', 'desc')
        .limit(limit)
        .offset(offset);

      return {
        events: events.map(event => ({
          id: event.id,
          name: event.name,
          description: event.description,
          eventDate: event.event_date,
          venueName: event.venue_name,
          capacity: event.capacity,
          status: event.status,
          ticketPrice: parseFloat(event.ticket_price || 0),
          createdAt: event.created_at
        })),
        total: total.count,
        limit,
        offset
      };
    } catch (error) {
      throw new Error(`Failed to get organizer events: ${error.message}`);
    }
  }

  /**
   * Get sales trend over time
   * @param {number} organizerId - User ID of organizer
   * @param {string} period - 'month' | 'year' | 'all'
   */
  async getSalesTrend(organizerId, period = 'month') {
    try {
      const dateRange = this._getDateRange(period);

      const results = await db('orders')
        .select(
          db.raw('DATE(orders.created_at) as date'),
          db.raw('COUNT(*) as orders_count'),
          db.raw('COUNT(DISTINCT event_tickets.id) as tickets_sold'),
          db.raw('SUM(orders.total_amount) as daily_revenue')
        )
        .join('event_tickets', 'orders.id', 'event_tickets.order_id')
        .join('events', 'event_tickets.event_id', 'events.id')
        .where('events.organizer_id', organizerId)
        .where('orders.status', 'completed')
        .where('orders.created_at', '>=', dateRange.start)
        .where('orders.created_at', '<=', dateRange.end)
        .where('orders.deleted_at', null)
        .groupBy(db.raw('DATE(orders.created_at)'))
        .orderBy('date', 'asc');

      return results.map(row => ({
        date: row.date,
        ordersCount: row.orders_count,
        ticketsSold: row.tickets_sold,
        dailyRevenue: parseFloat(row.daily_revenue || 0)
      }));
    } catch (error) {
      throw new Error(`Failed to get sales trend: ${error.message}`);
    }
  }

  /**
   * Get refund summary
   * @param {number} organizerId - User ID of organizer
   * @param {string} period - 'month' | 'year' | 'all'
   */
  async getRefundSummary(organizerId, period = 'month') {
    try {
      const dateRange = this._getDateRange(period);

      const results = await db('event_tickets')
        .select(
          'events.id as event_id',
          'events.name as event_name',
          db.raw('COUNT(*) as total_cancelled'),
          db.raw('SUM(event_tickets.refund_amount) as total_refunded'),
          db.raw('AVG(event_tickets.refund_amount) as avg_refund_amount'),
          db.raw('COUNT(CASE WHEN event_tickets.refund_reason IS NOT NULL THEN 1 END) as refunds_with_reason')
        )
        .join('events', 'event_tickets.event_id', 'events.id')
        .where('events.organizer_id', organizerId)
        .where('event_tickets.status', 'cancelled')
        .where('event_tickets.updated_at', '>=', dateRange.start)
        .where('event_tickets.updated_at', '<=', dateRange.end)
        .groupBy('events.id', 'events.name')
        .orderBy('total_refunded', 'desc');

      const totalRefundData = await db('event_tickets')
        .join('events', 'event_tickets.event_id', 'events.id')
        .where('events.organizer_id', organizerId)
        .where('event_tickets.status', 'cancelled')
        .where('event_tickets.updated_at', '>=', dateRange.start)
        .where('event_tickets.updated_at', '<=', dateRange.end)
        .select(
          db.raw('COUNT(*) as total_cancelled'),
          db.raw('SUM(event_tickets.refund_amount) as total_refunded'),
          db.raw('AVG(event_tickets.refund_amount) as avg_refund_amount')
        )
        .first();

      return {
        summary: {
          totalCancelled: totalRefundData?.total_cancelled || 0,
          totalRefunded: parseFloat(totalRefundData?.total_refunded || 0),
          avgRefundAmount: parseFloat(totalRefundData?.avg_refund_amount || 0)
        },
        byEvent: results.map(row => ({
          eventId: row.event_id,
          eventName: row.event_name,
          totalCancelled: row.total_cancelled,
          totalRefunded: parseFloat(row.total_refunded || 0),
          avgRefundAmount: parseFloat(row.avg_refund_amount || 0),
          refundsWithReason: row.refunds_with_reason
        }))
      };
    } catch (error) {
      throw new Error(`Failed to get refund summary: ${error.message}`);
    }
  }

  /**
   * Get customer demographics
   * @param {number} organizerId - User ID of organizer
   * @param {string} period - 'month' | 'year' | 'all'
   */
  async getCustomerDemographics(organizerId, period = 'month') {
    try {
      const dateRange = this._getDateRange(period);

      // Get customers by location (country)
      const byLocation = await db('event_tickets')
        .select(
          'users.country',
          db.raw('COUNT(DISTINCT users.id) as customer_count'),
          db.raw('COUNT(*) as tickets_sold'),
          db.raw('SUM(orders.total_amount) as total_spent')
        )
        .join('orders', 'event_tickets.order_id', 'orders.id')
        .join('users', 'orders.user_id', 'users.id')
        .join('events', 'event_tickets.event_id', 'events.id')
        .where('events.organizer_id', organizerId)
        .where('orders.status', 'completed')
        .where('orders.created_at', '>=', dateRange.start)
        .where('orders.created_at', '<=', dateRange.end)
        .whereNotNull('users.country')
        .groupBy('users.country')
        .orderBy('customer_count', 'desc')
        .limit(10);

      // Get ticket type preferences
      const byTicketType = await db('event_tickets')
        .select(
          'event_tickets.ticket_type',
          db.raw('COUNT(*) as count'),
          db.raw('SUM(orders.total_amount) as revenue')
        )
        .join('orders', 'event_tickets.order_id', 'orders.id')
        .join('events', 'event_tickets.event_id', 'events.id')
        .where('events.organizer_id', organizerId)
        .where('orders.status', 'completed')
        .where('orders.created_at', '>=', dateRange.start)
        .where('orders.created_at', '<=', dateRange.end)
        .groupBy('event_tickets.ticket_type')
        .orderBy('count', 'desc');

      // Get repeat customer rate
      const totalCustomers = await db('orders')
        .join('event_tickets', 'orders.id', 'event_tickets.order_id')
        .join('events', 'event_tickets.event_id', 'events.id')
        .where('events.organizer_id', organizerId)
        .where('orders.status', 'completed')
        .where('orders.created_at', '>=', dateRange.start)
        .where('orders.created_at', '<=', dateRange.end)
        .countDistinct('orders.user_id as count')
        .first();

      const repeatCustomers = await db('orders')
        .select('user_id', db.raw('COUNT(*) as purchase_count'))
        .join('event_tickets', 'orders.id', 'event_tickets.order_id')
        .join('events', 'event_tickets.event_id', 'events.id')
        .where('events.organizer_id', organizerId)
        .where('orders.status', 'completed')
        .where('orders.created_at', '>=', dateRange.start)
        .where('orders.created_at', '<=', dateRange.end)
        .groupBy('user_id')
        .having(db.raw('COUNT(*) > 1'))
        .then(rows => rows.length);

      return {
        byLocation: byLocation.map(row => ({
          country: row.country,
          customerCount: row.customer_count,
          ticketsSold: row.tickets_sold,
          totalSpent: parseFloat(row.total_spent || 0)
        })),
        byTicketType: byTicketType.map(row => ({
          ticketType: row.ticket_type,
          count: row.count,
          revenue: parseFloat(row.revenue || 0)
        })),
        customerMetrics: {
          totalUniqueCustomers: totalCustomers?.count || 0,
          repeatCustomers: repeatCustomers,
          repeatRate: totalCustomers?.count ? ((repeatCustomers / (totalCustomers?.count || 1)) * 100).toFixed(2) : 0
        }
      };
    } catch (error) {
      throw new Error(`Failed to get customer demographics: ${error.message}`);
    }
  }

  /**
   * Export organizer report
   * @param {number} organizerId - User ID of organizer
   * @param {string} reportType - 'revenue' | 'attendance' | 'customers' | 'full'
   * @param {string} period - 'month' | 'year' | 'all'
   */
  async generateReport(organizerId, reportType = 'full', period = 'month') {
    try {
      const report = {
        generatedAt: new Date(),
        period,
        reportType,
        data: {}
      };

      if (['revenue', 'full'].includes(reportType)) {
        report.data.overview = await this.getDashboardOverview(organizerId, period);
        report.data.revenueByEvent = await this.getRevenueByEvent(organizerId, period);
        report.data.salesTrend = await this.getSalesTrend(organizerId, period);
      }

      if (['attendance', 'full'].includes(reportType)) {
        report.data.attendance = await this.getAttendanceMetrics(organizerId, period);
      }

      if (['customers', 'full'].includes(reportType)) {
        report.data.demographics = await this.getCustomerDemographics(organizerId, period);
      }

      return report;
    } catch (error) {
      throw new Error(`Failed to generate report: ${error.message}`);
    }
  }

  /**
   * Helper to get date range based on period
   */
  _getDateRange(period) {
    const now = new Date();

    switch (period) {
      case 'month':
        return {
          start: startOfMonth(now),
          end: endOfMonth(now)
        };
      case 'year':
        return {
          start: startOfYear(now),
          end: endOfYear(now)
        };
      default:
        return {
          start: new Date('2000-01-01'),
          end: new Date()
        };
    }
  }
}

module.exports = new OrganizerService();
