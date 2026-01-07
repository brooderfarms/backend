const db = require('../config/database');
const { startOfMonth, endOfMonth, startOfYear, endOfYear, addDays } = require('date-fns');

class VenueManagerService {
  /**
   * Get venue manager dashboard overview
   * @param {number} venueId - Venue ID
   * @param {string} period - 'month' | 'year' | 'all'
   */
  async getDashboardOverview(venueId, period = 'month') {
    try {
      const dateRange = this._getDateRange(period);

      // Get venue info
      const venue = await db('venues')
        .where('id', venueId)
        .where('deleted_at', null)
        .first();

      if (!venue) {
        throw new Error('Venue not found');
      }

      // Get scheduled events count
      const eventsResult = await db('events')
        .where('venue_id', venueId)
        .where('deleted_at', null)
        .where('event_date', '>=', dateRange.start)
        .where('event_date', '<=', dateRange.end)
        .count('id as total');

      // Get total capacity
      const capacityResult = await db('events')
        .where('venue_id', venueId)
        .where('deleted_at', null)
        .sum('capacity as total');

      // Get current occupancy
      const occupancyResult = await db('event_tickets')
        .join('events', 'event_tickets.event_id', 'events.id')
        .where('events.venue_id', venueId)
        .where('event_tickets.status', '!=', 'cancelled')
        .count('event_tickets.id as total');

      // Get upcoming events (next 7 days)
      const upcomingResult = await db('events')
        .where('venue_id', venueId)
        .where('deleted_at', null)
        .where('event_date', '>=', new Date())
        .where('event_date', '<=', addDays(new Date(), 7))
        .count('id as total');

      // Get seat occupancy percentage
      const occupancyPercentage = venue.capacity
        ? ((occupancyResult[0]?.total || 0) / (capacityResult[0]?.total || 1) * 100).toFixed(2)
        : 0;

      return {
        venueId,
        venueName: venue.name,
        capacity: venue.capacity,
        totalCapacityInSchedule: capacityResult[0]?.total || 0,
        currentOccupancy: occupancyResult[0]?.total || 0,
        occupancyPercentage: parseFloat(occupancyPercentage),
        scheduledEvents: eventsResult[0]?.total || 0,
        upcomingEvents: upcomingResult[0]?.total || 0,
        period
      };
    } catch (error) {
      throw new Error(`Failed to get dashboard overview: ${error.message}`);
    }
  }

  /**
   * Get venue's event calendar with occupancy
   * @param {number} venueId - Venue ID
   * @param {string} startDate - Start date (ISO format)
   * @param {string} endDate - End date (ISO format)
   */
  async getEventCalendar(venueId, startDate, endDate) {
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);

      const events = await db('events')
        .select(
          'events.id',
          'events.name',
          'events.description',
          'events.event_date',
          'events.capacity',
          'events.status',
          'events.organizer_id',
          'users.first_name as organizer_first_name',
          'users.last_name as organizer_last_name',
          db.raw('COUNT(CASE WHEN event_tickets.status != \'cancelled\' THEN 1 END) as current_attendance')
        )
        .leftJoin('event_tickets', 'events.id', 'event_tickets.event_id')
        .leftJoin('users', 'events.organizer_id', 'users.id')
        .where('events.venue_id', venueId)
        .where('events.deleted_at', null)
        .where('events.event_date', '>=', start)
        .where('events.event_date', '<=', end)
        .groupBy(
          'events.id',
          'events.name',
          'events.description',
          'events.event_date',
          'events.capacity',
          'events.status',
          'events.organizer_id',
          'users.first_name',
          'users.last_name'
        )
        .orderBy('events.event_date', 'asc');

      return events.map(event => ({
        eventId: event.id,
        eventName: event.name,
        description: event.description,
        eventDate: event.event_date,
        capacity: event.capacity,
        currentAttendance: event.current_attendance,
        occupancyRate: (event.current_attendance / event.capacity * 100).toFixed(2),
        status: event.status,
        organizer: {
          id: event.organizer_id,
          name: `${event.organizer_first_name || ''} ${event.organizer_last_name || ''}`.trim()
        }
      }));
    } catch (error) {
      throw new Error(`Failed to get event calendar: ${error.message}`);
    }
  }

  /**
   * Get venue occupancy by event
   * @param {number} venueId - Venue ID
   * @param {string} period - 'month' | 'year' | 'all'
   */
  async getOccupancyByEvent(venueId, period = 'month') {
    try {
      const dateRange = this._getDateRange(period);

      const results = await db('events')
        .select(
          'events.id',
          'events.name',
          'events.event_date',
          'events.capacity',
          'events.status',
          db.raw('COUNT(CASE WHEN event_tickets.status = \'reserved\' THEN 1 END) as reserved'),
          db.raw('COUNT(CASE WHEN event_tickets.status = \'used\' THEN 1 END) as used'),
          db.raw('COUNT(CASE WHEN event_tickets.status = \'cancelled\' THEN 1 END) as cancelled')
        )
        .leftJoin('event_tickets', 'events.id', 'event_tickets.event_id')
        .where('events.venue_id', venueId)
        .where('events.deleted_at', null)
        .where('events.event_date', '>=', dateRange.start)
        .where('events.event_date', '<=', dateRange.end)
        .groupBy('events.id', 'events.name', 'events.event_date', 'events.capacity', 'events.status')
        .orderBy('events.event_date', 'desc');

      return results.map(event => {
        const totalTickets = (event.reserved || 0) + (event.used || 0);
        return {
          eventId: event.id,
          eventName: event.name,
          eventDate: event.event_date,
          capacity: event.capacity,
          reserved: event.reserved || 0,
          used: event.used || 0,
          cancelled: event.cancelled || 0,
          occupancyRate: (totalTickets / event.capacity * 100).toFixed(2),
          status: event.status
        };
      });
    } catch (error) {
      throw new Error(`Failed to get occupancy by event: ${error.message}`);
    }
  }

  /**
   * Get seat availability for an event
   * @param {number} venueId - Venue ID
   * @param {number} eventId - Event ID
   */
  async getEventSeatAvailability(venueId, eventId) {
    try {
      // Verify event belongs to venue
      const event = await db('events')
        .where('id', eventId)
        .where('venue_id', venueId)
        .where('deleted_at', null)
        .first();

      if (!event) {
        throw new Error('Event not found or unauthorized');
      }

      // Get seat status breakdown
      const seatStatus = await db('seats')
        .select('status', db.raw('COUNT(*) as count'))
        .where('event_id', eventId)
        .groupBy('status');

      // Get pricing tier breakdown
      const tierBreakdown = await db('seats')
        .select('pricing_tier', db.raw('COUNT(*) as count'))
        .where('event_id', eventId)
        .groupBy('pricing_tier');

      // Get available seats
      const availableSeats = await db('seats')
        .count('id as total')
        .where('event_id', eventId)
        .where('status', 'available')
        .first();

      // Get reserved seats
      const reservedSeats = await db('seats')
        .count('id as total')
        .where('event_id', eventId)
        .where('status', 'reserved')
        .first();

      return {
        eventId,
        eventName: event.name,
        eventDate: event.event_date,
        totalSeats: event.capacity,
        availableSeats: availableSeats?.total || 0,
        reservedSeats: reservedSeats?.total || 0,
        occupancyRate: ((event.capacity - (availableSeats?.total || 0)) / event.capacity * 100).toFixed(2),
        seatStatusBreakdown: seatStatus.map(s => ({
          status: s.status,
          count: s.count
        })),
        pricingTierBreakdown: tierBreakdown.map(t => ({
          tier: t.pricing_tier,
          count: t.count
        }))
      };
    } catch (error) {
      throw new Error(`Failed to get seat availability: ${error.message}`);
    }
  }

  /**
   * Get capacity alerts for venue
   * @param {number} venueId - Venue ID
   * @param {number} thresholdPercent - Alert threshold (default 80)
   */
  async getCapacityAlerts(venueId, thresholdPercent = 80) {
    try {
      const alerts = await db('events')
        .select(
          'events.id',
          'events.name',
          'events.event_date',
          'events.capacity',
          db.raw('COUNT(CASE WHEN event_tickets.status != \'cancelled\' THEN 1 END) as current_tickets')
        )
        .leftJoin('event_tickets', 'events.id', 'event_tickets.event_id')
        .where('events.venue_id', venueId)
        .where('events.deleted_at', null)
        .where('events.event_date', '>=', new Date())
        .groupBy('events.id', 'events.name', 'events.event_date', 'events.capacity')
        .having(db.raw(`COUNT(CASE WHEN event_tickets.status != 'cancelled' THEN 1 END) >= events.capacity * ?`, [thresholdPercent / 100]))
        .orderBy('events.event_date', 'asc');

      return alerts.map(event => ({
        eventId: event.id,
        eventName: event.name,
        eventDate: event.event_date,
        capacity: event.capacity,
        currentTickets: event.current_tickets,
        occupancyPercent: (event.current_tickets / event.capacity * 100).toFixed(2),
        alertLevel: event.current_tickets / event.capacity >= 0.95 ? 'critical' : 'warning'
      }));
    } catch (error) {
      throw new Error(`Failed to get capacity alerts: ${error.message}`);
    }
  }

  /**
   * Get venue utilization report
   * @param {number} venueId - Venue ID
   * @param {string} period - 'month' | 'year' | 'all'
   */
  async getUtilizationReport(venueId, period = 'month') {
    try {
      const dateRange = this._getDateRange(period);

      // Get average occupancy
      const occupancyData = await db('events')
        .select(
          db.raw('AVG(CAST(COUNT(CASE WHEN event_tickets.status != \'cancelled\' THEN 1 END) as DECIMAL) / events.capacity * 100) as avg_occupancy'),
          db.raw('MAX(CAST(COUNT(CASE WHEN event_tickets.status != \'cancelled\' THEN 1 END) as DECIMAL) / events.capacity * 100) as max_occupancy'),
          db.raw('MIN(CAST(COUNT(CASE WHEN event_tickets.status != \'cancelled\' THEN 1 END) as DECIMAL) / events.capacity * 100) as min_occupancy'),
          db.raw('COUNT(DISTINCT events.id) as total_events')
        )
        .leftJoin('event_tickets', 'events.id', 'event_tickets.event_id')
        .where('events.venue_id', venueId)
        .where('events.deleted_at', null)
        .where('events.event_date', '>=', dateRange.start)
        .where('events.event_date', '<=', dateRange.end)
        .first();

      // Get peak times
      const peakTimes = await db('events')
        .select(
          db.raw('EXTRACT(HOUR FROM events.event_date) as hour'),
          db.raw('COUNT(*) as event_count'),
          db.raw('AVG(CAST(COUNT(CASE WHEN event_tickets.status != \'cancelled\' THEN 1 END) as DECIMAL)) as avg_attendance')
        )
        .leftJoin('event_tickets', 'events.id', 'event_tickets.event_id')
        .where('events.venue_id', venueId)
        .where('events.deleted_at', null)
        .where('events.event_date', '>=', dateRange.start)
        .where('events.event_date', '<=', dateRange.end)
        .groupBy(db.raw('EXTRACT(HOUR FROM events.event_date)'))
        .orderBy('event_count', 'desc')
        .limit(5);

      // Get revenue by capacity utilization (if we have payment data)
      const revenueByOccupancy = await db('events')
        .select(
          db.raw('CASE WHEN CAST(COUNT(event_tickets.id) as DECIMAL) / events.capacity < 0.5 THEN \'Low (0-50%)\' WHEN CAST(COUNT(event_tickets.id) as DECIMAL) / events.capacity < 0.75 THEN \'Medium (50-75%)\' WHEN CAST(COUNT(event_tickets.id) as DECIMAL) / events.capacity < 0.9 THEN \'High (75-90%)\' ELSE \'Very High (90-100%)\' END as occupancy_band'),
          db.raw('COUNT(DISTINCT events.id) as event_count'),
          db.raw('SUM(orders.total_amount) as revenue')
        )
        .leftJoin('event_tickets', 'events.id', 'event_tickets.event_id')
        .leftJoin('orders', 'event_tickets.order_id', 'orders.id')
        .where('events.venue_id', venueId)
        .where('events.deleted_at', null)
        .where('orders.status', 'completed')
        .where('events.event_date', '>=', dateRange.start)
        .where('events.event_date', '<=', dateRange.end)
        .groupBy(db.raw('CASE WHEN CAST(COUNT(event_tickets.id) as DECIMAL) / events.capacity < 0.5 THEN \'Low (0-50%)\' WHEN CAST(COUNT(event_tickets.id) as DECIMAL) / events.capacity < 0.75 THEN \'Medium (50-75%)\' WHEN CAST(COUNT(event_tickets.id) as DECIMAL) / events.capacity < 0.9 THEN \'High (75-90%)\' ELSE \'Very High (90-100%)\' END'));

      return {
        period,
        occupancy: {
          average: parseFloat(occupancyData?.avg_occupancy || 0).toFixed(2),
          max: parseFloat(occupancyData?.max_occupancy || 0).toFixed(2),
          min: parseFloat(occupancyData?.min_occupancy || 0).toFixed(2),
          totalEvents: occupancyData?.total_events || 0
        },
        peakTimes: peakTimes.map(pt => ({
          hour: pt.hour,
          eventCount: pt.event_count,
          avgAttendance: parseFloat(pt.avg_attendance || 0).toFixed(2)
        })),
        revenueByOccupancy: revenueByOccupancy.map(row => ({
          occupancyBand: row.occupancy_band,
          eventCount: row.event_count,
          revenue: parseFloat(row.revenue || 0)
        }))
      };
    } catch (error) {
      throw new Error(`Failed to get utilization report: ${error.message}`);
    }
  }

  /**
   * Get upcoming event alerts and notifications
   * @param {number} venueId - Venue ID
   * @param {number} daysAhead - Number of days to look ahead (default 7)
   */
  async getUpcomingAlerts(venueId, daysAhead = 7) {
    try {
      const now = new Date();
      const futureDate = addDays(now, daysAhead);

      const events = await db('events')
        .select(
          'events.id',
          'events.name',
          'events.event_date',
          'events.status',
          'events.capacity',
          db.raw('COUNT(CASE WHEN event_tickets.status != \'cancelled\' THEN 1 END) as tickets_sold')
        )
        .leftJoin('event_tickets', 'events.id', 'event_tickets.event_id')
        .where('events.venue_id', venueId)
        .where('events.deleted_at', null)
        .where('events.event_date', '>=', now)
        .where('events.event_date', '<=', futureDate)
        .groupBy('events.id', 'events.name', 'events.event_date', 'events.status', 'events.capacity')
        .orderBy('events.event_date', 'asc');

      return events.map(event => {
        const occupancyPercent = (event.tickets_sold / event.capacity * 100).toFixed(2);
        let alertType = 'info';
        let message = 'Event scheduled';

        if (occupancyPercent >= 95) {
          alertType = 'critical';
          message = 'Venue near full capacity';
        } else if (occupancyPercent >= 80) {
          alertType = 'warning';
          message = 'High occupancy level';
        } else if (occupancyPercent < 20) {
          alertType = 'warning';
          message = 'Low ticket sales';
        }

        return {
          eventId: event.id,
          eventName: event.name,
          eventDate: event.event_date,
          status: event.status,
          ticketsSold: event.tickets_sold,
          capacity: event.capacity,
          occupancyPercent: parseFloat(occupancyPercent),
          alertType,
          message
        };
      });
    } catch (error) {
      throw new Error(`Failed to get upcoming alerts: ${error.message}`);
    }
  }

  /**
   * Get venue details with additional info
   * @param {number} venueId - Venue ID
   */
  async getVenueDetails(venueId) {
    try {
      const venue = await db('venues')
        .where('id', venueId)
        .where('deleted_at', null)
        .first();

      if (!venue) {
        throw new Error('Venue not found');
      }

      // Get event count
      const eventCount = await db('events')
        .where('venue_id', venueId)
        .where('deleted_at', null)
        .count('id as total')
        .first();

      // Get total tickets sold
      const ticketCount = await db('event_tickets')
        .join('events', 'event_tickets.event_id', 'events.id')
        .where('events.venue_id', venueId)
        .where('event_tickets.status', '!=', 'cancelled')
        .count('event_tickets.id as total')
        .first();

      // Get total revenue
      const revenue = await db('orders')
        .join('event_tickets', 'orders.id', 'event_tickets.order_id')
        .join('events', 'event_tickets.event_id', 'events.id')
        .where('events.venue_id', venueId)
        .where('orders.status', 'completed')
        .sum('orders.total_amount as total')
        .first();

      return {
        id: venue.id,
        name: venue.name,
        description: venue.description,
        capacity: venue.capacity,
        location: {
          address: venue.address,
          city: venue.city,
          state: venue.state,
          country: venue.country,
          postalCode: venue.postal_code,
          latitude: venue.latitude,
          longitude: venue.longitude
        },
        contact: {
          phone: venue.phone,
          email: venue.email
        },
        amenities: venue.amenities ? JSON.parse(venue.amenities) : [],
        stats: {
          totalEvents: eventCount?.total || 0,
          totalTicketsSold: ticketCount?.total || 0,
          totalRevenue: parseFloat(revenue?.total || 0)
        },
        createdAt: venue.created_at,
        updatedAt: venue.updated_at
      };
    } catch (error) {
      throw new Error(`Failed to get venue details: ${error.message}`);
    }
  }

  /**
   * Generate venue manager report
   * @param {number} venueId - Venue ID
   * @param {string} reportType - 'occupancy' | 'events' | 'utilization' | 'full'
   * @param {string} period - 'month' | 'year' | 'all'
   */
  async generateReport(venueId, reportType = 'full', period = 'month') {
    try {
      const report = {
        generatedAt: new Date(),
        period,
        reportType,
        data: {}
      };

      if (['occupancy', 'full'].includes(reportType)) {
        report.data.overview = await this.getDashboardOverview(venueId, period);
        report.data.occupancyByEvent = await this.getOccupancyByEvent(venueId, period);
      }

      if (['events', 'full'].includes(reportType)) {
        const startDate = new Date();
        const endDate = addDays(startDate, 90);
        report.data.upcomingEvents = await this.getEventCalendar(
          venueId,
          startDate.toISOString(),
          endDate.toISOString()
        );
      }

      if (['utilization', 'full'].includes(reportType)) {
        report.data.utilization = await this.getUtilizationReport(venueId, period);
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

module.exports = new VenueManagerService();
