const db = require('../config/database');
const crypto = require('crypto');

class StreamingService {
  /**
   * Initialize streaming (create stream record)
   * @param {number} eventId - Event ID
   * @param {string} streamTitle - Stream title
   * @param {string} streamUrl - Stream URL (HLS/RTMP endpoint)
   */
  async initializeStream(eventId, streamTitle, streamUrl) {
    try {
      // Verify event exists
      const event = await db('events')
        .where('id', eventId)
        .where('deleted_at', null)
        .first();

      if (!event) {
        throw new Error('Event not found');
      }

      // Check if stream already exists
      const existingStream = await db('streams')
        .where('event_id', eventId)
        .where('status', 'active')
        .first();

      if (existingStream) {
        throw new Error('Stream already active for this event');
      }

      // Generate stream key and secret
      const streamKey = crypto.randomBytes(32).toString('hex');
      const streamSecret = crypto.randomBytes(32).toString('hex');

      const stream = {
        event_id: eventId,
        title: streamTitle,
        stream_url: streamUrl,
        stream_key: streamKey,
        stream_secret: streamSecret,
        status: 'active',
        started_at: new Date(),
        viewer_count: 0,
        total_viewers: 0,
        created_at: new Date(),
        updated_at: new Date()
      };

      const [streamId] = await db('streams').insert(stream).returning('id');

      return {
        streamId,
        eventId,
        streamTitle,
        streamKey,
        streamUrl,
        status: 'active'
      };
    } catch (error) {
      throw new Error(`Failed to initialize stream: ${error.message}`);
    }
  }

  /**
   * End/stop stream
   * @param {number} streamId - Stream ID
   */
  async endStream(streamId) {
    try {
      const stream = await db('streams')
        .where('id', streamId)
        .where('status', 'active')
        .first();

      if (!stream) {
        throw new Error('Stream not found or already ended');
      }

      const endedAt = new Date();
      const durationMs = endedAt - stream.started_at;
      const durationMinutes = Math.floor(durationMs / 60000);

      await db('streams')
        .where('id', streamId)
        .update({
          status: 'ended',
          ended_at: endedAt,
          duration_minutes: durationMinutes,
          updated_at: endedAt
        });

      return {
        streamId,
        status: 'ended',
        durationMinutes,
        totalViewers: stream.total_viewers
      };
    } catch (error) {
      throw new Error(`Failed to end stream: ${error.message}`);
    }
  }

  /**
   * Update viewer count in real-time
   * @param {number} streamId - Stream ID
   * @param {number} viewerCount - Current viewer count
   */
  async updateViewerCount(streamId, viewerCount) {
    try {
      const stream = await db('streams')
        .where('id', streamId)
        .first();

      if (!stream) {
        throw new Error('Stream not found');
      }

      // Update max viewer count
      const newTotalViewers = Math.max(stream.total_viewers || 0, viewerCount);

      await db('streams')
        .where('id', streamId)
        .update({
          viewer_count: viewerCount,
          total_viewers: newTotalViewers,
          updated_at: new Date()
        });

      return {
        streamId,
        viewerCount,
        peakViewers: newTotalViewers
      };
    } catch (error) {
      throw new Error(`Failed to update viewer count: ${error.message}`);
    }
  }

  /**
   * Add stream viewer (track concurrent viewers)
   * @param {number} streamId - Stream ID
   * @param {number} userId - User ID (null for anonymous)
   */
  async addViewer(streamId, userId = null) {
    try {
      const viewerRecord = {
        stream_id: streamId,
        user_id: userId,
        joined_at: new Date(),
        left_at: null
      };

      const [viewerId] = await db('stream_viewers')
        .insert(viewerRecord)
        .returning('id');

      return {
        viewerId,
        streamId,
        userId
      };
    } catch (error) {
      throw new Error(`Failed to add viewer: ${error.message}`);
    }
  }

  /**
   * Remove stream viewer (track when they leave)
   * @param {number} viewerId - Viewer record ID
   */
  async removeViewer(viewerId) {
    try {
      const viewer = await db('stream_viewers')
        .where('id', viewerId)
        .first();

      if (!viewer) {
        throw new Error('Viewer record not found');
      }

      const leftAt = new Date();
      const watchedMinutes = Math.floor((leftAt - viewer.joined_at) / 60000);

      await db('stream_viewers')
        .where('id', viewerId)
        .update({
          left_at: leftAt,
          watched_minutes: watchedMinutes
        });

      return {
        viewerId,
        watchedMinutes
      };
    } catch (error) {
      throw new Error(`Failed to remove viewer: ${error.message}`);
    }
  }

  /**
   * Get stream statistics
   * @param {number} streamId - Stream ID
   */
  async getStreamStats(streamId) {
    try {
      const stream = await db('streams')
        .where('id', streamId)
        .first();

      if (!stream) {
        throw new Error('Stream not found');
      }

      // Get viewer statistics
      const viewerStats = await db('stream_viewers')
        .where('stream_id', streamId)
        .select(
          db.raw('COUNT(*) as total_viewers'),
          db.raw('COUNT(DISTINCT user_id) as unique_viewers'),
          db.raw('AVG(watched_minutes) as avg_watch_duration'),
          db.raw('MAX(watched_minutes) as max_watch_duration')
        )
        .first();

      // Get peak concurrent viewers
      const peakConcurrent = stream.total_viewers || 0;

      // Get chat messages count
      const chatStats = await db('stream_messages')
        .where('stream_id', streamId)
        .select(
          db.raw('COUNT(*) as total_messages'),
          db.raw('COUNT(DISTINCT user_id) as unique_chatters')
        )
        .first();

      const durationMinutes = stream.duration_minutes || 
        (stream.status === 'ended' ? Math.floor((stream.ended_at - stream.started_at) / 60000) : 
         Math.floor((new Date() - stream.started_at) / 60000));

      return {
        streamId,
        eventId: stream.event_id,
        title: stream.title,
        status: stream.status,
        startedAt: stream.started_at,
        endedAt: stream.ended_at,
        durationMinutes,
        viewerStats: {
          totalViewers: viewerStats?.total_viewers || 0,
          uniqueViewers: viewerStats?.unique_viewers || 0,
          currentViewers: stream.viewer_count || 0,
          peakConcurrent,
          avgWatchDuration: Math.round(viewerStats?.avg_watch_duration || 0),
          maxWatchDuration: viewerStats?.max_watch_duration || 0
        },
        chatStats: {
          totalMessages: chatStats?.total_messages || 0,
          uniqueChatters: chatStats?.unique_chatters || 0
        }
      };
    } catch (error) {
      throw new Error(`Failed to get stream stats: ${error.message}`);
    }
  }

  /**
   * Get stream by event ID
   * @param {number} eventId - Event ID
   */
  async getStreamByEventId(eventId) {
    try {
      const stream = await db('streams')
        .where('event_id', eventId)
        .where('deleted_at', null)
        .orderBy('created_at', 'desc')
        .first();

      if (!stream) {
        return null;
      }

      return {
        streamId: stream.id,
        eventId: stream.event_id,
        title: stream.title,
        streamUrl: stream.stream_url,
        status: stream.status,
        startedAt: stream.started_at,
        endedAt: stream.ended_at,
        viewerCount: stream.viewer_count,
        totalViewers: stream.total_viewers
      };
    } catch (error) {
      throw new Error(`Failed to get stream: ${error.message}`);
    }
  }

  /**
   * Get current viewers list
   * @param {number} streamId - Stream ID
   * @param {number} limit - Limit results
   */
  async getCurrentViewers(streamId, limit = 50) {
    try {
      const viewers = await db('stream_viewers')
        .select(
          'stream_viewers.id',
          'stream_viewers.user_id',
          'stream_viewers.joined_at',
          'users.first_name',
          'users.last_name',
          'users.email'
        )
        .leftJoin('users', 'stream_viewers.user_id', 'users.id')
        .where('stream_viewers.stream_id', streamId)
        .whereNull('stream_viewers.left_at')
        .orderBy('stream_viewers.joined_at', 'desc')
        .limit(limit);

      return viewers.map(v => ({
        viewerId: v.id,
        userId: v.user_id,
        joinedAt: v.joined_at,
        userName: v.user_id ? `${v.first_name || ''} ${v.last_name || ''}`.trim() : 'Anonymous',
        email: v.email
      }));
    } catch (error) {
      throw new Error(`Failed to get current viewers: ${error.message}`);
    }
  }

  /**
   * Send/post chat message
   * @param {number} streamId - Stream ID
   * @param {number} userId - User ID (null for anonymous)
   * @param {string} message - Message content
   */
  async sendChatMessage(streamId, userId, message) {
    try {
      // Validate stream exists
      const stream = await db('streams')
        .where('id', streamId)
        .where('status', 'active')
        .first();

      if (!stream) {
        throw new Error('Stream not found or not active');
      }

      // Prevent spam (max 10 messages per minute per user)
      if (userId) {
        const recentMessages = await db('stream_messages')
          .where('stream_id', streamId)
          .where('user_id', userId)
          .where('created_at', '>=', new Date(Date.now() - 60000))
          .count('id as count')
          .first();

        if (recentMessages?.count >= 10) {
          throw new Error('Too many messages. Please wait before sending another.');
        }
      }

      // Filter inappropriate content (basic check)
      const sanitized = message.slice(0, 500); // Max 500 chars

      const msgRecord = {
        stream_id: streamId,
        user_id: userId,
        message: sanitized,
        created_at: new Date()
      };

      const [messageId] = await db('stream_messages')
        .insert(msgRecord)
        .returning('id');

      return {
        messageId,
        streamId,
        userId,
        message: sanitized,
        timestamp: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  /**
   * Get chat messages
   * @param {number} streamId - Stream ID
   * @param {number} limit - Limit results (default 50)
   * @param {number} offset - Offset for pagination
   */
  async getChatMessages(streamId, limit = 50, offset = 0) {
    try {
      const messages = await db('stream_messages')
        .select(
          'stream_messages.id',
          'stream_messages.message',
          'stream_messages.created_at',
          'stream_messages.user_id',
          'users.first_name',
          'users.last_name'
        )
        .leftJoin('users', 'stream_messages.user_id', 'users.id')
        .where('stream_messages.stream_id', streamId)
        .orderBy('stream_messages.created_at', 'desc')
        .limit(limit)
        .offset(offset);

      return messages.map(msg => ({
        messageId: msg.id,
        message: msg.message,
        timestamp: msg.created_at,
        userId: msg.user_id,
        userName: msg.user_id ? `${msg.first_name || ''} ${msg.last_name || ''}`.trim() : 'Anonymous'
      }));
    } catch (error) {
      throw new Error(`Failed to get chat messages: ${error.message}`);
    }
  }

  /**
   * Ban viewer from stream
   * @param {number} streamId - Stream ID
   * @param {number} userId - User ID to ban
   * @param {string} reason - Ban reason
   */
  async banViewer(streamId, userId, reason = '') {
    try {
      const ban = {
        stream_id: streamId,
        user_id: userId,
        reason,
        banned_at: new Date()
      };

      const [banId] = await db('stream_bans')
        .insert(ban)
        .returning('id');

      // Remove any active viewer records
      await db('stream_viewers')
        .where('stream_id', streamId)
        .where('user_id', userId)
        .whereNull('left_at')
        .update({ left_at: new Date() });

      // Delete recent chat messages
      await db('stream_messages')
        .where('stream_id', streamId)
        .where('user_id', userId)
        .del();

      return {
        banId,
        streamId,
        userId,
        reason,
        bannedAt: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to ban viewer: ${error.message}`);
    }
  }

  /**
   * Check if user is banned from stream
   * @param {number} streamId - Stream ID
   * @param {number} userId - User ID to check
   */
  async isUserBanned(streamId, userId) {
    try {
      const ban = await db('stream_bans')
        .where('stream_id', streamId)
        .where('user_id', userId)
        .first();

      return !!ban;
    } catch (error) {
      throw new Error(`Failed to check ban status: ${error.message}`);
    }
  }

  /**
   * Get stream playback URL/details
   * @param {number} streamId - Stream ID
   */
  async getPlaybackDetails(streamId) {
    try {
      const stream = await db('streams')
        .where('id', streamId)
        .first();

      if (!stream) {
        throw new Error('Stream not found');
      }

      // Get recording URL if available
      const recording = await db('stream_recordings')
        .where('stream_id', streamId)
        .where('status', 'completed')
        .first();

      return {
        streamId: stream.id,
        eventId: stream.event_id,
        title: stream.title,
        liveUrl: stream.status === 'active' ? stream.stream_url : null,
        recordingUrl: recording?.recording_url || null,
        status: stream.status,
        startedAt: stream.started_at,
        endedAt: stream.ended_at,
        isLive: stream.status === 'active',
        viewerCount: stream.viewer_count || 0
      };
    } catch (error) {
      throw new Error(`Failed to get playback details: ${error.message}`);
    }
  }

  /**
   * Archive stream recording
   * @param {number} streamId - Stream ID
   * @param {string} recordingUrl - URL to recorded video
   */
  async archiveRecording(streamId, recordingUrl) {
    try {
      const stream = await db('streams')
        .where('id', streamId)
        .first();

      if (!stream) {
        throw new Error('Stream not found');
      }

      const recording = {
        stream_id: streamId,
        event_id: stream.event_id,
        recording_url: recordingUrl,
        status: 'completed',
        created_at: new Date(),
        updated_at: new Date()
      };

      const [recordingId] = await db('stream_recordings')
        .insert(recording)
        .returning('id');

      return {
        recordingId,
        streamId,
        recordingUrl,
        archivedAt: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to archive recording: ${error.message}`);
    }
  }

  /**
   * Get event stream history
   * @param {number} eventId - Event ID
   */
  async getEventStreamHistory(eventId) {
    try {
      const streams = await db('streams')
        .where('event_id', eventId)
        .where('deleted_at', null)
        .orderBy('created_at', 'desc');

      return streams.map(stream => ({
        streamId: stream.id,
        title: stream.title,
        status: stream.status,
        startedAt: stream.started_at,
        endedAt: stream.ended_at,
        durationMinutes: stream.duration_minutes,
        totalViewers: stream.total_viewers,
        peakViewers: stream.total_viewers
      }));
    } catch (error) {
      throw new Error(`Failed to get stream history: ${error.message}`);
    }
  }
}

module.exports = new StreamingService();
