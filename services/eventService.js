const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditService = require('./auditService');

class EventService {
  /**
   * Get all published events with advanced filtering
   */
  async getPublishedEvents(filters = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        category,
        event_type,
        venue_id,
        organizer_id,
        start_date,
        end_date,
        sort_by = 'start_date',
        sort_order = 'asc',
        min_price,
        max_price,
        featured_only = false
      } = filters;

      const offset = (page - 1) * limit;

      let query = db('events')
        .leftJoin('venues', 'events.venue_id', 'venues.id')
        .leftJoin('users as organizers', 'events.organizer_id', 'organizers.id')
        .where('events.status', 'published')
        .where('events.is_approved', true)
        .whereNull('events.deleted_at')
        .select([
          'events.*',
          'venues.name as venue_name',
          'venues.city as venue_city',
          'venues.address as venue_address',
          'organizers.first_name as organizer_first_name',
          'organizers.last_name as organizer_last_name'
        ]);

      // Search
      if (search) {
        query = query.where(function() {
          this.where('events.title', 'ilike', `%${search}%`)
            .orWhere('events.description', 'ilike', `%${search}%`)
            .orWhere('venues.name', 'ilike', `%${search}%`);
        });
      }

      // Category filter
      if (category) {
        query = query.where('events.category', category);
      }

      // Event type filter
      if (event_type) {
        query = query.where('events.event_type', event_type);
      }

      // Venue filter
      if (venue_id) {
        query = query.where('events.venue_id', venue_id);
      }

      // Organizer filter
      if (organizer_id) {
        query = query.where('events.organizer_id', organizer_id);
      }

      // Date range
      if (start_date) {
        query = query.where('events.start_date', '>=', start_date);
      }

      if (end_date) {
        query = query.where('events.end_date', '<=', end_date);
      }

      // Price range
      if (min_price) {
        query = query.where('events.min_price', '>=', min_price);
      }

      if (max_price) {
        query = query.where('events.max_price', '<=', max_price);
      }

      // Featured only
      if (featured_only) {
        query = query.where('events.is_featured', true);
      }

      // Sort
      query = query.orderBy(`events.${sort_by}`, sort_order);

      // Get count
      const countQuery = query.clone().clearSelect().clearOrder().count('events.id as count').first();
      const [events, totalCount] = await Promise.all([
        query.limit(limit).offset(offset),
        countQuery
      ]);

      return {
        events,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(totalCount.count),
          pages: Math.ceil(totalCount.count / limit)
        }
      };
    } catch (error) {
      console.error('Get published events error:', error);
      throw error;
    }
  }

  /**
   * Get event details with related data
   */
  async getEventDetails(eventId) {
    try {
      const event = await db('events')
        .leftJoin('venues', 'events.venue_id', 'venues.id')
        .leftJoin('users as organizers', 'events.organizer_id', 'organizers.id')
        .where('events.id', eventId)
        .whereNull('events.deleted_at')
        .select([
          'events.*',
          'venues.name as venue_name',
          'venues.city as venue_city',
          'venues.state as venue_state',
          'venues.country as venue_country',
          'venues.address as venue_address',
          'venues.capacity as venue_capacity',
          'venues.facilities as venue_facilities',
          'venues.layout_config as venue_layout_config',
          'organizers.first_name as organizer_first_name',
          'organizers.last_name as organizer_last_name',
          'organizers.email as organizer_email',
          'organizers.phone as organizer_phone'
        ])
        .first();

      if (!event) {
        return null;
      }

      // Get ticket statistics
      const ticketStats = await db('tickets')
        .where('event_id', eventId)
        .whereNull('deleted_at')
        .select(
          db.raw('COUNT(*) as total_issued'),
          db.raw('COUNT(CASE WHEN status = \'confirmed\' THEN 1 END) as confirmed'),
          db.raw('COUNT(CASE WHEN status = \'used\' THEN 1 END) as used'),
          db.raw('COUNT(CASE WHEN status = \'reserved\' THEN 1 END) as reserved'),
          db.raw('COUNT(CASE WHEN status = \'cancelled\' THEN 1 END) as cancelled')
        )
        .first();

      // Get average rating
      const ratingData = await db('event_reviews')
        .where('event_id', eventId)
        .avg('rating as average_rating')
        .count('id as review_count')
        .first();

      event.ticket_stats = ticketStats;
      event.average_rating = ratingData?.average_rating || 0;
      event.review_count = parseInt(ratingData?.review_count) || 0;
      event.available_capacity = (event.venue_capacity || 0) - (ticketStats?.confirmed || 0);

      return event;
    } catch (error) {
      console.error('Get event details error:', error);
      throw error;
    }
  }

  /**
   * Create a new event
   */
  async createEvent(eventData, userId) {
    try {
      const event = {
        id: uuidv4(),
        ...eventData,
        organizer_id: userId,
        created_at: new Date(),
        updated_at: new Date(),
        status: eventData.status || 'draft',
        is_approved: false,
        is_featured: false,
        is_archived: false
      };

      // Calculate duration
      const startDate = new Date(event.start_date);
      const endDate = new Date(event.end_date);
      event.duration_minutes = Math.floor((endDate - startDate) / (1000 * 60));

      // Validate venue exists
      const venue = await db('venues')
        .where('id', event.venue_id)
        .whereNull('deleted_at')
        .first();

      if (!venue) {
        throw new Error('Venue not found');
      }

      const [createdEvent] = await db('events')
        .insert(event)
        .returning('*');

      // Log audit
      await auditService.log({
        userId,
        action: 'EVENT_CREATED',
        resource: 'events',
        resourceId: createdEvent.id,
        newValues: { title: createdEvent.title, status: createdEvent.status }
      });

      return createdEvent;
    } catch (error) {
      console.error('Create event error:', error);
      throw error;
    }
  }

  /**
   * Update an event
   */
  async updateEvent(eventId, updateData, userId) {
    try {
      const event = await db('events').where('id', eventId).first();

      if (!event) {
        throw new Error('Event not found');
      }

      // Prevent updates to certain fields
      delete updateData.id;
      delete updateData.created_at;
      delete updateData.deleted_at;
      delete updateData.organizer_id;

      updateData.updated_at = new Date();

      // Recalculate duration if dates changed
      if (updateData.start_date || updateData.end_date) {
        const startDate = new Date(updateData.start_date || event.start_date);
        const endDate = new Date(updateData.end_date || event.end_date);
        updateData.duration_minutes = Math.floor((endDate - startDate) / (1000 * 60));
      }

      const [updatedEvent] = await db('events')
        .where('id', eventId)
        .update(updateData)
        .returning('*');

      // Log audit
      await auditService.log({
        userId,
        action: 'EVENT_UPDATED',
        resource: 'events',
        resourceId: eventId,
        oldValues: { title: event.title },
        newValues: { title: updatedEvent.title }
      });

      return updatedEvent;
    } catch (error) {
      console.error('Update event error:', error);
      throw error;
    }
  }

  /**
   * Soft delete an event
   */
  async deleteEvent(eventId, userId) {
    try {
      const event = await db('events').where('id', eventId).first();

      if (!event) {
        throw new Error('Event not found');
      }

      const [deletedEvent] = await db('events')
        .where('id', eventId)
        .update({
          deleted_at: new Date(),
          status: 'cancelled',
          updated_at: new Date()
        })
        .returning('*');

      // Log audit
      await auditService.log({
        userId,
        action: 'EVENT_DELETED',
        resource: 'events',
        resourceId: eventId,
        newValues: { status: 'cancelled' }
      });

      return deletedEvent;
    } catch (error) {
      console.error('Delete event error:', error);
      throw error;
    }
  }

  /**
   * Get event statistics
   */
  async getEventStatistics(eventId) {
    try {
      const event = await db('events').where('id', eventId).first();

      if (!event) {
        throw new Error('Event not found');
      }

      const stats = await db('tickets')
        .where('event_id', eventId)
        .whereNull('deleted_at')
        .select(
          db.raw('COUNT(*) as total_tickets'),
          db.raw('COUNT(CASE WHEN status = \'confirmed\' THEN 1 END) as confirmed_tickets'),
          db.raw('COUNT(CASE WHEN status = \'used\' THEN 1 END) as used_tickets'),
          db.raw('COUNT(CASE WHEN status = \'reserved\' THEN 1 END) as reserved_tickets'),
          db.raw('COUNT(CASE WHEN status = \'cancelled\' THEN 1 END) as cancelled_tickets'),
          db.raw('SUM(CASE WHEN status IN (\'confirmed\', \'used\') THEN total_amount ELSE 0 END) as total_revenue'),
          db.raw('AVG(CASE WHEN status IN (\'confirmed\', \'used\') THEN total_amount ELSE NULL END) as average_ticket_price')
        )
        .first();

      const occupancyRate = event.total_capacity > 0
        ? Math.round(((stats.confirmed_tickets + stats.used_tickets) / event.total_capacity) * 100)
        : 0;

      return {
        ...stats,
        occupancy_rate: occupancyRate,
        available_tickets: event.total_capacity - (stats.confirmed_tickets + stats.used_tickets),
        event_capacity: event.total_capacity
      };
    } catch (error) {
      console.error('Get event statistics error:', error);
      throw error;
    }
  }

  /**
   * Get upcoming events
   */
  async getUpcomingEvents(limit = 5) {
    try {
      const now = new Date();

      const events = await db('events')
        .leftJoin('venues', 'events.venue_id', 'venues.id')
        .where('events.status', 'published')
        .where('events.is_approved', true)
        .where('events.start_date', '>', now)
        .whereNull('events.deleted_at')
        .select([
          'events.*',
          'venues.name as venue_name',
          'venues.city as venue_city'
        ])
        .orderBy('events.start_date', 'asc')
        .limit(limit);

      return events;
    } catch (error) {
      console.error('Get upcoming events error:', error);
      throw error;
    }
  }

  /**
   * Get featured events
   */
  async getFeaturedEvents(limit = 10) {
    try {
      const events = await db('events')
        .leftJoin('venues', 'events.venue_id', 'venues.id')
        .where('events.status', 'published')
        .where('events.is_approved', true)
        .where('events.is_featured', true)
        .whereNull('events.deleted_at')
        .select([
          'events.*',
          'venues.name as venue_name',
          'venues.city as venue_city'
        ])
        .orderBy('events.created_at', 'desc')
        .limit(limit);

      return events;
    } catch (error) {
      console.error('Get featured events error:', error);
      throw error;
    }
  }

  /**
   * Search events with full-text search
   */
  async searchEvents(searchTerm, filters = {}) {
    try {
      const { limit = 10, offset = 0 } = filters;

      let query = db('events')
        .leftJoin('venues', 'events.venue_id', 'venues.id')
        .where('events.status', 'published')
        .where('events.is_approved', true)
        .whereNull('events.deleted_at');

      if (searchTerm) {
        query = query.where(function() {
          this.where('events.title', 'ilike', `%${searchTerm}%`)
            .orWhere('events.description', 'ilike', `%${searchTerm}%`)
            .orWhere('events.category', 'ilike', `%${searchTerm}%`)
            .orWhere('venues.name', 'ilike', `%${searchTerm}%`)
            .orWhere('venues.city', 'ilike', `%${searchTerm}%`);
        });
      }

      query = query
        .select([
          'events.*',
          'venues.name as venue_name',
          'venues.city as venue_city'
        ])
        .orderBy('events.start_date', 'asc')
        .limit(limit)
        .offset(offset);

      return await query;
    } catch (error) {
      console.error('Search events error:', error);
      throw error;
    }
  }

  /**
   * Get events by category
   */
  async getEventsByCategory(category, filters = {}) {
    try {
      const { page = 1, limit = 10 } = filters;
      const offset = (page - 1) * limit;

      let query = db('events')
        .leftJoin('venues', 'events.venue_id', 'venues.id')
        .where('events.category', category)
        .where('events.status', 'published')
        .where('events.is_approved', true)
        .whereNull('events.deleted_at')
        .select([
          'events.*',
          'venues.name as venue_name',
          'venues.city as venue_city'
        ])
        .orderBy('events.start_date', 'asc');

      const countQuery = query.clone().clearSelect().clearOrder().count('events.id as count').first();
      const [events, totalCount] = await Promise.all([
        query.limit(limit).offset(offset),
        countQuery
      ]);

      return {
        events,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(totalCount.count),
          pages: Math.ceil(totalCount.count / limit)
        }
      };
    } catch (error) {
      console.error('Get events by category error:', error);
      throw error;
    }
  }

  /**
   * Get events by venue
   */
  async getEventsByVenue(venueId, filters = {}) {
    try {
      const { page = 1, limit = 10, status = 'published' } = filters;
      const offset = (page - 1) * limit;

      let query = db('events')
        .where('events.venue_id', venueId)
        .whereNull('events.deleted_at');

      if (status) {
        query = query.where('events.status', status);
      }

      query = query
        .select('events.*')
        .orderBy('events.start_date', 'asc');

      const countQuery = query.clone().clearOrder().count('id as count').first();
      const [events, totalCount] = await Promise.all([
        query.limit(limit).offset(offset),
        countQuery
      ]);

      return {
        events,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(totalCount.count),
          pages: Math.ceil(totalCount.count / limit)
        }
      };
    } catch (error) {
      console.error('Get events by venue error:', error);
      throw error;
    }
  }

  /**
   * Publish an event
   */
  async publishEvent(eventId, userId) {
    try {
      const event = await db('events').where('id', eventId).first();

      if (!event) {
        throw new Error('Event not found');
      }

      if (event.status !== 'draft') {
        throw new Error('Only draft events can be published');
      }

      const [publishedEvent] = await db('events')
        .where('id', eventId)
        .update({
          status: 'published',
          published_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');

      await auditService.log({
        userId,
        action: 'EVENT_PUBLISHED',
        resource: 'events',
        resourceId: eventId,
        newValues: { status: 'published' }
      });

      return publishedEvent;
    } catch (error) {
      console.error('Publish event error:', error);
      throw error;
    }
  }

  /**
   * Cancel an event
   */
  async cancelEvent(eventId, reason, userId) {
    try {
      const event = await db('events').where('id', eventId).first();

      if (!event) {
        throw new Error('Event not found');
      }

      const [cancelledEvent] = await db('events')
        .where('id', eventId)
        .update({
          status: 'cancelled',
          cancellation_reason: reason,
          cancelled_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');

      // Automatically refund all confirmed tickets
      const confirmedTickets = await db('tickets')
        .where('event_id', eventId)
        .where('status', 'confirmed')
        .update({
          status: 'refunded',
          updated_at: new Date()
        })
        .returning('id');

      await auditService.log({
        userId,
        action: 'EVENT_CANCELLED',
        resource: 'events',
        resourceId: eventId,
        newValues: { status: 'cancelled', reason }
      });

      return {
        event: cancelledEvent,
        refundedTickets: confirmedTickets.length
      };
    } catch (error) {
      console.error('Cancel event error:', error);
      throw error;
    }
  }
}

module.exports = new EventService();
