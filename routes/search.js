const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { verifyToken } = require('../middleware/auth');
const searchFilterService = require('../services/searchFilterService');

// ===== EVENT SEARCH & FILTERS =====

/**
 * GET /api/search/events
 * Search events with advanced filters
 * @query {string} search - Search term
 * @query {string} category - Event category
 * @query {number} minPrice - Minimum price
 * @query {number} maxPrice - Maximum price
 * @query {number} venue - Venue ID
 * @query {string} startDate - Start date (ISO 8601)
 * @query {string} endDate - End date (ISO 8601)
 * @query {string} status - Event status
 * @query {number} minRating - Minimum rating
 * @query {string} sortBy - Sort field (date, price, rating, created_at, title)
 * @query {string} order - Sort order (asc, desc)
 * @query {number} limit - Results per page (default: 20)
 * @query {number} offset - Pagination offset (default: 0)
 */
router.get('/events', async (req, res) => {
  try {
    const {
      search = '',
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
    } = req.query;

    // Validate pagination
    const parsedLimit = Math.min(parseInt(limit) || 20, 100);
    const parsedOffset = parseInt(offset) || 0;

    const filters = {
      searchTerm: search,
      category,
      minPrice: minPrice ? parseFloat(minPrice) : null,
      maxPrice: maxPrice ? parseFloat(maxPrice) : null,
      venue: venue ? parseInt(venue) : null,
      startDate,
      endDate,
      status,
      minRating: minRating ? parseFloat(minRating) : null,
      sortBy,
      order,
      limit: parsedLimit,
      offset: parsedOffset
    };

    // Log search if user is authenticated
    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = require('jsonwebtoken').decode(token);
        if (decoded?.id) {
          await searchFilterService.logSearch(decoded.id, search, 'events');
        }
      } catch (e) {
        // Silent fail
      }
    }

    const result = await searchFilterService.searchEvents(filters);
    res.json(result);
  } catch (error) {
    console.error('Error searching events:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/search/events/filters
 * Get available event filter options and facets
 */
router.get('/events/filters', async (req, res) => {
  try {
    const filterOptions = await searchFilterService.getEventFilterOptions();
    res.json(filterOptions);
  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/search/events/suggestions
 * Get event search suggestions
 * @query {string} q - Search term
 */
router.get('/events/suggestions', async (req, res) => {
  try {
    const { q = '' } = req.query;
    const suggestions = await searchFilterService.getSearchSuggestions(q, 'events');
    res.json({ suggestions });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== TICKET SEARCH =====

/**
 * GET /api/search/tickets
 * Search tickets by various criteria
 * @query {number} eventId - Filter by event
 * @query {number} userId - Filter by user
 * @query {string} status - Ticket status
 * @query {string} seatType - Seat type
 * @query {number} minPrice - Minimum price
 * @query {number} maxPrice - Maximum price
 * @query {string} sortBy - Sort field (created_at, price, seat_number)
 * @query {string} order - Sort order (asc, desc)
 * @query {number} limit - Results per page
 * @query {number} offset - Pagination offset
 */
router.get('/tickets', verifyToken, async (req, res) => {
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
    } = req.query;

    // Authorization: can only search own tickets unless admin
    const searchUserId = req.user.role === 'admin' && userId ? parseInt(userId) : req.user.id;

    const parsedLimit = Math.min(parseInt(limit) || 20, 100);
    const parsedOffset = parseInt(offset) || 0;

    const filters = {
      eventId: eventId ? parseInt(eventId) : null,
      userId: searchUserId,
      status,
      seatType,
      minPrice: minPrice ? parseFloat(minPrice) : null,
      maxPrice: maxPrice ? parseFloat(maxPrice) : null,
      sortBy,
      order,
      limit: parsedLimit,
      offset: parsedOffset
    };

    const result = await searchFilterService.searchTickets(filters);
    res.json(result);
  } catch (error) {
    console.error('Error searching tickets:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== VENUE SEARCH & FILTERS =====

/**
 * GET /api/search/venues
 * Search venues with advanced filters
 * @query {string} search - Search term
 * @query {string} city - Filter by city
 * @query {string} country - Filter by country
 * @query {number} minCapacity - Minimum capacity
 * @query {number} maxCapacity - Maximum capacity
 * @query {string} amenities - Comma-separated amenities
 * @query {string} sortBy - Sort field (name, capacity, rating, created_at)
 * @query {string} order - Sort order (asc, desc)
 * @query {number} limit - Results per page
 * @query {number} offset - Pagination offset
 */
router.get('/venues', async (req, res) => {
  try {
    const {
      search = '',
      city = null,
      country = null,
      minCapacity = null,
      maxCapacity = null,
      amenities = '',
      sortBy = 'name',
      order = 'asc',
      limit = 20,
      offset = 0
    } = req.query;

    const parsedLimit = Math.min(parseInt(limit) || 20, 100);
    const parsedOffset = parseInt(offset) || 0;
    const amenitiesArray = amenities ? amenities.split(',').map((a) => a.trim()) : [];

    const filters = {
      searchTerm: search,
      city,
      country,
      minCapacity: minCapacity ? parseInt(minCapacity) : null,
      maxCapacity: maxCapacity ? parseInt(maxCapacity) : null,
      amenities: amenitiesArray,
      sortBy,
      order,
      limit: parsedLimit,
      offset: parsedOffset
    };

    const result = await searchFilterService.searchVenues(filters);
    res.json(result);
  } catch (error) {
    console.error('Error searching venues:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/search/venues/filters
 * Get available venue filter options
 */
router.get('/venues/filters', async (req, res) => {
  try {
    const filterOptions = await searchFilterService.getVenueFilterOptions();
    res.json(filterOptions);
  } catch (error) {
    console.error('Error fetching venue filter options:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/search/venues/suggestions
 * Get venue search suggestions
 * @query {string} q - Search term
 */
router.get('/venues/suggestions', async (req, res) => {
  try {
    const { q = '' } = req.query;
    const suggestions = await searchFilterService.getSearchSuggestions(q, 'venues');
    res.json({ suggestions });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== GENERAL SEARCH =====

/**
 * GET /api/search/popular
 * Get popular searches
 */
router.get('/popular', async (req, res) => {
  try {
    const popular = await searchFilterService.getPopularSearches();
    res.json({ popular });
  } catch (error) {
    console.error('Error fetching popular searches:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/search/suggestions/:type
 * Get search suggestions for a specific type
 * @param {string} type - Type (events, venues, users)
 * @query {string} q - Search term
 */
router.get('/suggestions/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { q = '' } = req.query;

    if (!['events', 'venues', 'users'].includes(type)) {
      return res.status(400).json({ error: 'Invalid search type' });
    }

    const suggestions = await searchFilterService.getSearchSuggestions(q, type);
    res.json({ type, suggestions });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
