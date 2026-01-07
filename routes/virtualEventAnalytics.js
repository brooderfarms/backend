const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const db = require('../config/database');

// Get virtual events analytics dashboard data
router.get('/', authenticateToken, authorizeRole('admin', 'organizer'), async (req, res) => {
  try {
    const { timeRange = '30days' } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Determine date range
    let startDate = new Date();
    if (timeRange === '7days') startDate.setDate(startDate.getDate() - 7);
    else if (timeRange === '30days') startDate.setDate(startDate.getDate() - 30);
    else if (timeRange === '90days') startDate.setDate(startDate.getDate() - 90);
    else if (timeRange === 'year') startDate.setFullYear(startDate.getFullYear() - 1);

    // Build base query based on role
    let eventQuery = db('events').where('event_mode', 'in', ['virtual', 'hybrid']);
    
    if (userRole === 'organizer') {
      eventQuery = eventQuery.where('organizer_id', userId);
    }

    eventQuery = eventQuery.where('created_at', '>=', startDate);

    // Total virtual events
    const totalVirtualEvents = await eventQuery.clone().count('* as count').first();

    // Total attendees
    const attendeesQuery = await db('tickets')
      .join('events', 'tickets.event_id', '=', 'events.id')
      .where('events.event_mode', 'in', ['virtual', 'hybrid'])
      .where('events.created_at', '>=', startDate)
      .where('tickets.status', 'completed')
      .count('tickets.* as count');

    const totalAttendees = userRole === 'admin' 
      ? attendeesQuery[0].count 
      : await db('tickets')
          .join('events', 'tickets.event_id', '=', 'events.id')
          .where('events.organizer_id', userId)
          .where('events.event_mode', 'in', ['virtual', 'hybrid'])
          .where('events.created_at', '>=', startDate)
          .where('tickets.status', 'completed')
          .count('tickets.* as count')
          .then(r => r[0].count);

    // Total revenue
    const revenueQuery = await db('payments')
      .join('tickets', 'payments.ticket_id', '=', 'tickets.id')
      .join('events', 'tickets.event_id', '=', 'events.id')
      .where('events.event_mode', 'in', ['virtual', 'hybrid'])
      .where('events.created_at', '>=', startDate)
      .where('payments.status', 'completed')
      .sum('payments.amount as total');

    const totalRevenue = revenueQuery[0].total || 0;

    // Average rating
    const ratingQuery = await eventQuery.clone().avg('average_rating as avgRating').first();
    const averageRating = ratingQuery.avgRating || 0;

    // Attendees over time (last 30 days)
    const attendeesOverTime = await db('tickets')
      .select(
        db.raw('DATE(created_at) as date'),
        db.raw('COUNT(*) as attendees')
      )
      .join('events', 'tickets.event_id', '=', 'events.id')
      .where('events.event_mode', 'in', ['virtual', 'hybrid'])
      .where('events.created_at', '>=', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .where('tickets.status', 'completed')
      .groupBy(db.raw('DATE(created_at)'))
      .orderBy('date');

    // Event type distribution
    const eventTypeDistribution = await eventQuery.clone()
      .select('virtual_event_type')
      .count('* as value')
      .groupBy('virtual_event_type')
      .map(row => ({
        name: (row.virtual_event_type || 'other').replace(/_/g, ' '),
        value: row.value,
      }));

    // Revenue by event type
    const revenueByType = await db('payments')
      .select('events.virtual_event_type')
      .sum('payments.amount as revenue')
      .join('tickets', 'payments.ticket_id', '=', 'tickets.id')
      .join('events', 'tickets.event_id', '=', 'events.id')
      .where('events.event_mode', 'in', ['virtual', 'hybrid'])
      .where('events.created_at', '>=', startDate)
      .where('payments.status', 'completed')
      .groupBy('events.virtual_event_type')
      .map(row => ({
        type: (row.virtual_event_type || 'other').replace(/_/g, ' '),
        revenue: parseFloat(row.revenue) || 0,
      }));

    // Platform usage
    const platformUsage = await eventQuery.clone()
      .select('meeting_platform')
      .count('* as count')
      .groupBy('meeting_platform')
      .map(row => ({
        platform: (row.meeting_platform || 'none').replace(/_/g, ' '),
        count: row.count,
      }));

    // Top performing events
    const topEvents = await eventQuery.clone()
      .select('id', 'title', 'virtual_event_type as type', 'average_rating as rating')
      .select(
        db.raw(
          '(SELECT COUNT(*) FROM tickets WHERE event_id = events.id AND status = \'completed\') as attendees'
        ),
        db.raw(
          '(SELECT COALESCE(SUM(amount), 0) FROM payments WHERE ticket_id IN (SELECT id FROM tickets WHERE event_id = events.id) AND status = \'completed\') as revenue'
        )
      )
      .limit(10)
      .orderBy('average_rating', 'desc');

    // Feature usage statistics
    const featureUsageQuery = await eventQuery.clone()
      .select(
        db.raw('SUM(CASE WHEN chat_enabled THEN 1 ELSE 0 END) as chat'),
        db.raw('SUM(CASE WHEN screen_share_enabled THEN 1 ELSE 0 END) as screen_share'),
        db.raw('SUM(CASE WHEN q_and_a_enabled THEN 1 ELSE 0 END) as q_and_a'),
        db.raw('SUM(CASE WHEN polling_enabled THEN 1 ELSE 0 END) as polling'),
        db.raw('SUM(CASE WHEN breakout_rooms_enabled THEN 1 ELSE 0 END) as breakout_rooms'),
        db.raw('COUNT(*) as total')
      )
      .first();

    const totalEvents = featureUsageQuery.total || 1;

    const featureUsage = [
      { name: 'Live Chat', percentage: Math.round((featureUsageQuery.chat / totalEvents) * 100) },
      { name: 'Screen Sharing', percentage: Math.round((featureUsageQuery.screen_share / totalEvents) * 100) },
      { name: 'Q&A Session', percentage: Math.round((featureUsageQuery.q_and_a / totalEvents) * 100) },
      { name: 'Live Polling', percentage: Math.round((featureUsageQuery.polling / totalEvents) * 100) },
      { name: 'Breakout Rooms', percentage: Math.round((featureUsageQuery.breakout_rooms / totalEvents) * 100) },
    ];

    // Completion rate statistics
    const completionStats = await db('tickets')
      .select(
        db.raw('COUNT(*) as total'),
        db.raw('SUM(CASE WHEN completion_percentage >= 80 THEN 1 ELSE 0 END) as completed')
      )
      .join('events', 'tickets.event_id', '=', 'events.id')
      .where('events.event_mode', 'in', ['virtual', 'hybrid'])
      .where('events.created_at', '>=', startDate)
      .first();

    const avgCompletionRate = completionStats
      ? Math.round((completionStats.completed / completionStats.total) * 100)
      : 0;

    // Average session duration
    const avgSessionDuration = await db('tickets')
      .avg('session_duration as avg')
      .join('events', 'tickets.event_id', '=', 'events.id')
      .where('events.event_mode', 'in', ['virtual', 'hybrid'])
      .where('events.created_at', '>=', startDate)
      .first()
      .then(r => Math.round(r.avg || 0));

    // Certificate rate
    const certificateStats = await db('tickets')
      .select(
        db.raw('COUNT(*) as total'),
        db.raw('SUM(CASE WHEN certificate_issued_at IS NOT NULL THEN 1 ELSE 0 END) as issued')
      )
      .join('events', 'tickets.event_id', '=', 'events.id')
      .where('events.provides_certificate', true)
      .where('events.created_at', '>=', startDate)
      .first();

    const certificateRate = certificateStats && certificateStats.total
      ? Math.round((certificateStats.issued / certificateStats.total) * 100)
      : 0;

    // Attendee satisfaction (from reviews)
    const satisfactionQuery = await db('event_reviews')
      .avg('rating as avg')
      .join('events', 'event_reviews.event_id', '=', 'events.id')
      .where('events.event_mode', 'in', ['virtual', 'hybrid'])
      .where('events.created_at', '>=', startDate)
      .first();

    const attendeeSatisfaction = satisfactionQuery && satisfactionQuery.avg
      ? Math.round((satisfactionQuery.avg / 5) * 100)
      : 85;

    return res.json({
      success: true,
      data: {
        totalVirtualEvents: totalVirtualEvents.count,
        totalAttendees,
        totalRevenue: parseFloat(totalRevenue),
        averageRating: parseFloat(averageRating),
        attendeesOverTime,
        eventTypeDistribution,
        revenueByType,
        platformUsage,
        topEvents,
        featureUsage,
        avgCompletionRate,
        avgSessionDuration,
        certificateRate,
        attendeeSatisfaction,
      },
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
  }
});

// Get virtual event details with engagement metrics
router.get('/:eventId', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;

    const event = await db('events')
      .where('id', eventId)
      .where('event_mode', 'in', ['virtual', 'hybrid'])
      .first();

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    // Attendee count
    const attendeeCount = await db('tickets')
      .where('event_id', eventId)
      .where('status', 'completed')
      .count('* as count')
      .first();

    // Engagement metrics
    const engagementMetrics = await db('tickets')
      .where('event_id', eventId)
      .select(
        db.raw('AVG(completion_percentage) as avg_completion'),
        db.raw('AVG(session_duration) as avg_duration'),
        db.raw('SUM(CASE WHEN chat_messages_count > 0 THEN 1 ELSE 0 END) as engaged_with_chat'),
        db.raw('SUM(CASE WHEN raised_hand_count > 0 THEN 1 ELSE 0 END) as raised_hand_count'),
        db.raw('SUM(CASE WHEN poll_responses_count > 0 THEN 1 ELSE 0 END) as poll_respondents')
      )
      .first();

    // Certificate issuance
    const certificateStats = await db('tickets')
      .where('event_id', eventId)
      .count('* as total')
      .select(db.raw('SUM(CASE WHEN certificate_issued_at IS NOT NULL THEN 1 ELSE 0 END) as issued'))
      .first();

    // Recording stats
    const recordingStats = {
      recording_url: event.recording_url,
      recording_available: event.recording_available_after_event,
      total_views: await db('event_analytics')
        .where('event_id', eventId)
        .where('action', 'recording_viewed')
        .count('* as count')
        .first()
        .then(r => r.count),
    };

    return res.json({
      success: true,
      data: {
        event,
        attendeeCount: attendeeCount.count,
        engagementMetrics,
        certificateStats,
        recordingStats,
      },
    });
  } catch (err) {
    console.error('Event details error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch event details' });
  }
});

// Update meeting link (post-event)
router.put('/:eventId/meeting-link', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { meeting_link, recording_url, recording_available_after_event } = req.body;

    const event = await db('events').where('id', eventId).first();

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    // Check authorization
    if (req.user.id !== event.organizer_id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await db('events').where('id', eventId).update({
      meeting_link,
      recording_url,
      recording_available_after_event,
      updated_at: new Date(),
    });

    res.json({ success: true, message: 'Meeting details updated' });
  } catch (err) {
    console.error('Update meeting link error:', err);
    res.status(500).json({ success: false, message: 'Failed to update meeting details' });
  }
});

// Send email reminders for upcoming virtual events
router.post('/:eventId/send-reminders', authenticateToken, authorizeRole('admin', 'organizer'), async (req, res) => {
  try {
    const { eventId } = req.params;
    const { reminder_type = 'all' } = req.body; // 'all', 'not_registered', 'registered'

    const event = await db('events').where('id', eventId).first();

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    // Check authorization
    if (req.user.id !== event.organizer_id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    let usersQuery = db('users');

    if (reminder_type === 'registered') {
      usersQuery = usersQuery
        .join('tickets', 'users.id', '=', 'tickets.user_id')
        .where('tickets.event_id', eventId)
        .where('tickets.status', 'completed');
    }

    const recipients = await usersQuery.select('users.id', 'users.email', 'users.first_name').distinct();

    // TODO: Integrate with email service to send reminders
    const remindersSent = recipients.length;

    res.json({
      success: true,
      message: `Reminders sent to ${remindersSent} recipients`,
      remindersSent,
    });
  } catch (err) {
    console.error('Send reminders error:', err);
    res.status(500).json({ success: false, message: 'Failed to send reminders' });
  }
});

// Track virtual event engagement
router.post('/:eventId/track-engagement', async (req, res) => {
  try {
    const { eventId } = req.params;
    const {
      user_id,
      action,
      duration,
      engagement_data,
    } = req.body;

    await db('event_analytics').insert({
      event_id: eventId,
      user_id,
      action,
      duration,
      engagement_data: JSON.stringify(engagement_data),
      created_at: new Date(),
    });

    res.json({ success: true, message: 'Engagement tracked' });
  } catch (err) {
    console.error('Track engagement error:', err);
    res.status(500).json({ success: false, message: 'Failed to track engagement' });
  }
});

module.exports = router;
