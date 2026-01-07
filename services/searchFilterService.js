/**
 * Search & Filter Service
 * Provides advanced search and filtering capabilities for events, tickets, venues
 * Supports full-text search, faceted filtering, sorting, and result ranking
 */

const db = require('../config/database');

class SearchFilterService {
  constructor() {
    this.db = db;
  }

  /**
   * Search events with advanced filters
   * @param {Object} filters - Search criteria
   * @returns {Promise<Array>} Search results
   */
  async searchEvents(filters = {}) {
    try {
      const {
        searchTerm = '',
        category = null,
        minPrice = null,
        maxPrice = null,
        venue = null,
        startDate = null,
        endDate = null,
        status = null,
        minRating = null,
        sortBy = 'date',
        order = 'asc',
        limit = 20,
        offset = 0
      } = filters;

      let query = this.db('events')
        .select(
          'events.id',
          'events.title',
          'events.description',
          'events.category',
          'events.base_price',
          'events.venue_id',
          'events.start_date',
          'events.end_date',
          'events.status',
          'events.featured',
          'events.ratings_count',
          'events.average_rating',
          'venues.name as venue_name',
          'venues.city',
          'venues.country'
        )
        .join('venues', 'events.venue_id', '=', 'venues.id')
        .where('events.status', '!=', 'deleted');

      // Full-text search
      if (searchTerm) {
        query.where((q) => {
          q.where('events.title', 'like', `%${searchTerm}%`)
            .orWhere('events.description', 'like', `%${searchTerm}%`)
            .orWhere('events.category', 'like', `%${searchTerm}%`);
        });
      }

      // Category filter
      if (category) {
        query.where('events.category', category);
      }

      // Price range filter
      if (minPrice !== null) {
        query.where('events.base_price', '>=', minPrice);
      }
      if (maxPrice !== null) {
        query.where('events.base_price', '<=', maxPrice);
      }

      // Venue filter
      if (venue) {
        query.where('events.venue_id', venue);
      }

      // Date range filter
      if (startDate) {
        const dateStart = new Date(startDate);
        query.where('events.start_date', '>=', dateStart);
      }
      if (endDate) {
        const dateEnd = new Date(endDate);
        query.where('events.end_date', '<=', dateEnd);
      }

      // Status filter
      if (status) {
        query.where('events.status', status);
      }

      // Rating filter
      if (minRating !== null) {
        query.where('events.average_rating', '>=', minRating);
      }

      // Sorting
      const validSortColumns = ['date', 'price', 'rating', 'created_at', 'title'];
      let sortColumn = 'events.start_date';

      if (sortBy === 'price') sortColumn = 'events.base_price';
      if (sortBy === 'rating') sortColumn = 'events.average_rating';
      if (sortBy === 'created_at') sortColumn = 'events.created_at';
      if (sortBy === 'title') sortColumn = 'events.title';

      query.orderBy(sortColumn, order === 'desc' ? 'desc' : 'asc');

      // Pagination
      const total = await this.db('events')
        .count('* as count')
        .where((q) => {
          if (searchTerm) {
            q.where('events.title', 'like', `%${searchTerm}%`)
              .orWhere('events.description', 'like', `%${searchTerm}%`)
              .orWhere('events.category', 'like', `%${searchTerm}%`);
          }
        })
        .modify((queryBuilder) => {
          if (category) queryBuilder.where('events.category', category);
          if (minPrice !== null) queryBuilder.where('events.base_price', '>=', minPrice);
          if (maxPrice !== null) queryBuilder.where('events.base_price', '<=', maxPrice);
          if (venue) queryBuilder.where('events.venue_id', venue);
          if (startDate) queryBuilder.where('events.start_date', '>=', new Date(startDate));
          if (endDate) queryBuilder.where('events.end_date', '<=', new Date(endDate));
          if (status) queryBuilder.where('events.status', status);
          if (minRating !== null) queryBuilder.where('events.average_rating', '>=', minRating);
        })
        .first();

      const results = await query.limit(limit).offset(offset);

      return {
        results,
        pagination: {
          total: total?.count || 0,
          limit,
          offset,
          hasMore: offset + results.length < total?.count
        },
        filters: {
          searchTerm,
          category,
          priceRange: { min: minPrice, max: maxPrice },
          venue,
          dateRange: { start: startDate, end: endDate },
          status,
          minRating
        }
      };
    } catch (error) {
      console.error('Error searching events:', error);
      throw new Error(`Failed to search events: ${error.message}`);
    }
  }

  /**
   * Get event filter options and facets
   * @returns {Promise<Object>} Available filters and options
   */
  async getEventFilterOptions() {
    try {
      const categories = await this.db('events')
        .select('category')
        .distinct()
        .where('status', '!=', 'deleted')
        .where('category', '!=', null);

      const venues = await this.db('venues')
        .select('id', 'name', 'city')
        .where('status', 'active')
        .orderBy('name');

      const priceRanges = await this.db('events')
        .min('base_price as minPrice')
        .max('base_price as maxPrice')
        .where('status', '!=', 'deleted')
        .first();

      const statuses = ['draft', 'published', 'cancelled', 'completed'];

      const dateRange = await this.db('events')
        .min('start_date as earliest')
        .max('end_date as latest')
        .where('status', '!=', 'deleted')
        .first();

      return {
        categories: categories.map((c) => c.category).filter(Boolean),
        venues,
        priceRange: priceRanges || { minPrice: 0, maxPrice: 0 },
        statuses,
        dateRange: {
          earliest: dateRange?.earliest,
          latest: dateRange?.latest
        },
        ratings: [1, 2, 3, 4, 5]
      };
    } catch (error) {
      console.error('Error fetching filter options:', error);
      throw new Error(`Failed to fetch filter options: ${error.message}`);
    }
  }

  /**
   * Search tickets by various criteria
   * @param {Object} filters - Search criteria
   * @returns {Promise<Array>} Search results
   */
  async searchTickets(filters = {}) {
    try {
      const {
        eventId = null,
        userId = null,
        status = null,
        seatType = null,
        minPrice = null,
        maxPrice = null,
        sortBy = 'created_at',
        order = 'desc',
        limit = 20,
        offset = 0
      } = filters;

      let query = this.db('tickets')
        .select(
          'tickets.id',
          'tickets.event_id',
          'tickets.user_id',
          'tickets.seat_number',
          'tickets.seat_type',
          'tickets.price',
          'tickets.status',
          'tickets.nfc_tag',
          'tickets.qr_code',
          'tickets.created_at',
          'events.title as event_title',
          'events.start_date',
          'users.email',
          'users.full_name'
        )
        .join('events', 'tickets.event_id', '=', 'events.id')
        .leftJoin('users', 'tickets.user_id', '=', 'users.id');

      // Filters
      if (eventId) {
        query.where('tickets.event_id', eventId);
      }
      if (userId) {
        query.where('tickets.user_id', userId);
      }
      if (status) {
        query.where('tickets.status', status);
      }
      if (seatType) {
        query.where('tickets.seat_type', seatType);
      }
      if (minPrice !== null) {
        query.where('tickets.price', '>=', minPrice);
      }
      if (maxPrice !== null) {
        query.where('tickets.price', '<=', maxPrice);
      }

      // Sorting
      const validSortColumns = ['created_at', 'price', 'seat_number'];
      let sortColumn = 'tickets.created_at';

      if (sortBy === 'price') sortColumn = 'tickets.price';
      if (sortBy === 'seat_number') sortColumn = 'tickets.seat_number';

      query.orderBy(sortColumn, order === 'desc' ? 'desc' : 'asc');

      // Pagination
      const total = await this.db('tickets')
        .count('* as count')
        .modify((queryBuilder) => {
          if (eventId) queryBuilder.where('tickets.event_id', eventId);
          if (userId) queryBuilder.where('tickets.user_id', userId);
          if (status) queryBuilder.where('tickets.status', status);
          if (seatType) queryBuilder.where('tickets.seat_type', seatType);
          if (minPrice !== null) queryBuilder.where('tickets.price', '>=', minPrice);
          if (maxPrice !== null) queryBuilder.where('tickets.price', '<=', maxPrice);
        })
        .first();

      const results = await query.limit(limit).offset(offset);

      return {
        results,
        pagination: {
          total: total?.count || 0,
          limit,
          offset,
          hasMore: offset + results.length < total?.count
        }
      };
    } catch (error) {
      console.error('Error searching tickets:', error);
      throw new Error(`Failed to search tickets: ${error.message}`);
    }
  }

  /**
   * Search venues with filters
   * @param {Object} filters - Search criteria
   * @returns {Promise<Array>} Search results
   */
  async searchVenues(filters = {}) {
    try {
      const {
        searchTerm = '',
        city = null,
        country = null,
        minCapacity = null,
        maxCapacity = null,
        amenities = [],
        sortBy = 'name',
        order = 'asc',
        limit = 20,
        offset = 0
      } = filters;

      let query = this.db('venues')
        .select(
          'venues.id',
          'venues.name',
          'venues.address',
          'venues.city',
          'venues.country',
          'venues.capacity',
          'venues.status',
          'venues.amenities',
          'venues.ratings_count',
          'venues.average_rating',
          'venues.created_at'
        )
        .where('venues.status', 'active');

      // Full-text search
      if (searchTerm) {
        query.where((q) => {
          q.where('venues.name', 'like', `%${searchTerm}%`)
            .orWhere('venues.address', 'like', `%${searchTerm}%`)
            .orWhere('venues.city', 'like', `%${searchTerm}%`);
        });
      }

      // Location filters
      if (city) {
        query.where('venues.city', city);
      }
      if (country) {
        query.where('venues.country', country);
      }

      // Capacity filter
      if (minCapacity !== null) {
        query.where('venues.capacity', '>=', minCapacity);
      }
      if (maxCapacity !== null) {
        query.where('venues.capacity', '<=', maxCapacity);
      }

      // Amenities filter
      if (amenities.length > 0) {
        query.where((q) => {
          amenities.forEach((amenity) => {
            q.orWhere('venues.amenities', 'like', `%${amenity}%`);
          });
        });
      }

      // Sorting
      let sortColumn = 'venues.name';
      if (sortBy === 'capacity') sortColumn = 'venues.capacity';
      if (sortBy === 'rating') sortColumn = 'venues.average_rating';
      if (sortBy === 'created_at') sortColumn = 'venues.created_at';

      query.orderBy(sortColumn, order === 'desc' ? 'desc' : 'asc');

      // Pagination
      const total = await this.db('venues')
        .count('* as count')
        .where('venues.status', 'active')
        .modify((queryBuilder) => {
          if (searchTerm) {
            queryBuilder.where((q) => {
              q.where('venues.name', 'like', `%${searchTerm}%`)
                .orWhere('venues.address', 'like', `%${searchTerm}%`)
                .orWhere('venues.city', 'like', `%${searchTerm}%`);
            });
          }
          if (city) queryBuilder.where('venues.city', city);
          if (country) queryBuilder.where('venues.country', country);
          if (minCapacity !== null) queryBuilder.where('venues.capacity', '>=', minCapacity);
          if (maxCapacity !== null) queryBuilder.where('venues.capacity', '<=', maxCapacity);
        })
        .first();

      const results = await query.limit(limit).offset(offset);

      return {
        results,
        pagination: {
          total: total?.count || 0,
          limit,
          offset,
          hasMore: offset + results.length < total?.count
        }
      };
    } catch (error) {
      console.error('Error searching venues:', error);
      throw new Error(`Failed to search venues: ${error.message}`);
    }
  }

  /**
   * Get venue filter options
   * @returns {Promise<Object>} Available filters
   */
  async getVenueFilterOptions() {
    try {
      const cities = await this.db('venues')
        .select('city')
        .distinct()
        .where('status', 'active')
        .where('city', '!=', null)
        .orderBy('city');

      const countries = await this.db('venues')
        .select('country')
        .distinct()
        .where('status', 'active')
        .where('country', '!=', null)
        .orderBy('country');

      const capacityRange = await this.db('venues')
        .min('capacity as minCapacity')
        .max('capacity as maxCapacity')
        .where('status', 'active')
        .first();

      const commonAmenities = [
        'Parking',
        'WiFi',
        'Wheelchair Accessible',
        'Catering',
        'Sound System',
        'Lighting',
        'Stage',
        'Dressing Rooms'
      ];

      return {
        cities: cities.map((c) => c.city).filter(Boolean),
        countries: countries.map((c) => c.country).filter(Boolean),
        capacityRange: capacityRange || { minCapacity: 0, maxCapacity: 0 },
        amenities: commonAmenities
      };
    } catch (error) {
      console.error('Error fetching venue filter options:', error);
      throw new Error(`Failed to fetch venue filter options: ${error.message}`);
    }
  }

  /**
   * Get search suggestions based on partial input
   * @param {string} searchTerm - Partial search term
   * @param {string} type - Type of search (events, venues, users)
   * @returns {Promise<Array>} Suggestions
   */
  async getSearchSuggestions(searchTerm, type = 'events') {
    try {
      if (!searchTerm || searchTerm.length < 2) {
        return [];
      }

      const pattern = `${searchTerm}%`;

      if (type === 'events') {
        return await this.db('events')
          .select('id', 'title as label', 'category')
          .where('status', '!=', 'deleted')
          .where('title', 'like', pattern)
          .limit(10);
      }

      if (type === 'venues') {
        return await this.db('venues')
          .select('id', 'name as label', 'city')
          .where('status', 'active')
          .where('name', 'like', pattern)
          .limit(10);
      }

      if (type === 'users') {
        return await this.db('users')
          .select('id', 'full_name as label', 'email')
          .where('full_name', 'like', pattern)
          .limit(10);
      }

      return [];
    } catch (error) {
      console.error('Error fetching search suggestions:', error);
      throw new Error(`Failed to fetch suggestions: ${error.message}`);
    }
  }

  /**
   * Get popular searches
   * @returns {Promise<Array>} Popular search terms
   */
  async getPopularSearches() {
    try {
      const searches = await this.db('search_logs')
        .select('search_term')
        .count('* as count')
        .where('created_at', '>', this.db.raw("DATE_SUB(NOW(), INTERVAL 30 DAY)"))
        .groupBy('search_term')
        .orderBy('count', 'desc')
        .limit(10);

      return searches;
    } catch (error) {
      // If search_logs table doesn't exist, return empty
      console.error('Error fetching popular searches:', error);
      return [];
    }
  }

  /**
   * Log a search query
   * @param {number} userId - User performing search
   * @param {string} searchTerm - Search term used
   * @param {string} type - Type of search
   */
  async logSearch(userId, searchTerm, type = 'events') {
    try {
      await this.db('search_logs').insert({
        user_id: userId,
        search_term: searchTerm,
        search_type: type,
        created_at: new Date()
      });
    } catch (error) {
      // Silently fail if logging not available
      console.error('Error logging search:', error);
    }
  }
}

module.exports = new SearchFilterService();
