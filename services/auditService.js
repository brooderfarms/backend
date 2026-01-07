const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class AuditService {
  /**
   * Log an action/activity
   */
  async log(auditData) {
    try {
      const {
        userId,
        action, // CREATE, UPDATE, DELETE, LOGIN, PAYMENT, etc.
        resource, // users, events, tickets, payments, etc.
        resourceId,
        oldValues = null,
        newValues = null,
        metadata = null,
        ipAddress = null,
        userAgent = null,
        sessionId = null,
        isSuspicious = false,
        notes = null
      } = auditData;

      const log = await db('audit_logs').insert({
        id: uuidv4(),
        user_id: userId,
        action: action,
        resource: resource,
        resource_id: resourceId,
        old_values: oldValues ? JSON.stringify(oldValues) : null,
        new_values: newValues ? JSON.stringify(newValues) : null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ip_address: ipAddress,
        user_agent: userAgent,
        timestamp: db.fn.now(),
        session_id: sessionId,
        is_suspicious: isSuspicious,
        notes: notes
      }).returning('*');

      return log[0];
    } catch (error) {
      console.error('Audit logging error:', error);
      // Don't throw error - audit logging should not break main operations
      return null;
    }
  }

  /**
   * Get audit logs with filters
   */
  async getLogs(filters = {}) {
    try {
      let query = db('audit_logs');

      if (filters.userId) {
        query = query.where('user_id', filters.userId);
      }

      if (filters.action) {
        if (Array.isArray(filters.action)) {
          query = query.whereIn('action', filters.action);
        } else {
          query = query.where('action', filters.action);
        }
      }

      if (filters.resource) {
        if (Array.isArray(filters.resource)) {
          query = query.whereIn('resource', filters.resource);
        } else {
          query = query.where('resource', filters.resource);
        }
      }

      if (filters.resourceId) {
        query = query.where('resource_id', filters.resourceId);
      }

      if (filters.isSuspicious) {
        query = query.where('is_suspicious', filters.isSuspicious);
      }

      if (filters.startDate) {
        query = query.where('timestamp', '>=', filters.startDate);
      }

      if (filters.endDate) {
        query = query.where('timestamp', '<=', filters.endDate);
      }

      const page = filters.page || 1;
      const limit = filters.limit || 50;
      const offset = (page - 1) * limit;

      // Get total count
      const countQuery = query.clone().count('* as total').first();
      const countResult = await countQuery;
      const total = countResult.total;

      // Get paginated results
      const logs = await query
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .offset(offset);

      return {
        data: logs,
        pagination: {
          total: total,
          page: page,
          limit: limit,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      throw error;
    }
  }

  /**
   * Get user activity timeline
   */
  async getUserActivityTimeline(userId, filters = {}) {
    try {
      let query = db('audit_logs')
        .where('user_id', userId)
        .select('timestamp', 'action', 'resource', 'resource_id', 'metadata', 'notes');

      if (filters.startDate) {
        query = query.where('timestamp', '>=', filters.startDate);
      }

      if (filters.endDate) {
        query = query.where('timestamp', '<=', filters.endDate);
      }

      const activities = await query
        .orderBy('timestamp', 'desc')
        .limit(filters.limit || 100);

      return activities;
    } catch (error) {
      console.error('Error fetching user activity timeline:', error);
      throw error;
    }
  }

  /**
   * Get resource change history
   */
  async getResourceHistory(resource, resourceId) {
    try {
      const history = await db('audit_logs')
        .where('resource', resource)
        .where('resource_id', resourceId)
        .orderBy('timestamp', 'asc');

      // Parse JSON fields
      const parsedHistory = history.map(log => ({
        ...log,
        old_values: log.old_values ? JSON.parse(log.old_values) : null,
        new_values: log.new_values ? JSON.parse(log.new_values) : null,
        metadata: log.metadata ? JSON.parse(log.metadata) : null
      }));

      return parsedHistory;
    } catch (error) {
      console.error('Error fetching resource history:', error);
      throw error;
    }
  }

  /**
   * Get activity summary for dashboard
   */
  async getActivitySummary(filters = {}) {
    try {
      const startDate = filters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = filters.endDate || new Date();

      // Total actions
      const totalActions = await db('audit_logs')
        .where('timestamp', '>=', startDate)
        .where('timestamp', '<=', endDate)
        .count('* as count')
        .first();

      // Actions by type
      const actionBreakdown = await db('audit_logs')
        .where('timestamp', '>=', startDate)
        .where('timestamp', '<=', endDate)
        .groupBy('action')
        .count('* as count')
        .select('action');

      // Resources affected
      const resourceBreakdown = await db('audit_logs')
        .where('timestamp', '>=', startDate)
        .where('timestamp', '<=', endDate)
        .groupBy('resource')
        .count('* as count')
        .select('resource');

      // Suspicious activities
      const suspiciousActivities = await db('audit_logs')
        .where('timestamp', '>=', startDate)
        .where('timestamp', '<=', endDate)
        .where('is_suspicious', true)
        .count('* as count')
        .first();

      // Active users
      const activeUsers = await db('audit_logs')
        .where('timestamp', '>=', startDate)
        .where('timestamp', '<=', endDate)
        .distinct('user_id')
        .pluck('user_id');

      return {
        period: {
          startDate,
          endDate
        },
        totalActions: totalActions.count,
        actionBreakdown,
        resourceBreakdown,
        suspiciousActivities: suspiciousActivities.count,
        activeUserCount: activeUsers.length,
        activeUsers: activeUsers.length > 0 ? activeUsers.slice(0, 10) : [] // Top 10
      };
    } catch (error) {
      console.error('Error generating activity summary:', error);
      throw error;
    }
  }

  /**
   * Log user authentication
   */
  async logLogin(userId, ipAddress, userAgent, sessionId) {
    try {
      return await this.log({
        userId,
        action: 'LOGIN',
        resource: 'users',
        resourceId: userId,
        ipAddress,
        userAgent,
        sessionId
      });
    } catch (error) {
      console.error('Error logging login:', error);
    }
  }

  /**
   * Log user logout
   */
  async logLogout(userId, sessionId) {
    try {
      return await this.log({
        userId,
        action: 'LOGOUT',
        resource: 'users',
        resourceId: userId,
        sessionId
      });
    } catch (error) {
      console.error('Error logging logout:', error);
    }
  }

  /**
   * Log resource creation
   */
  async logCreate(userId, resource, resourceId, newValues, metadata = null) {
    try {
      return await this.log({
        userId,
        action: 'CREATE',
        resource,
        resourceId,
        newValues,
        metadata
      });
    } catch (error) {
      console.error('Error logging create:', error);
    }
  }

  /**
   * Log resource update
   */
  async logUpdate(userId, resource, resourceId, oldValues, newValues, metadata = null) {
    try {
      return await this.log({
        userId,
        action: 'UPDATE',
        resource,
        resourceId,
        oldValues,
        newValues,
        metadata
      });
    } catch (error) {
      console.error('Error logging update:', error);
    }
  }

  /**
   * Log resource deletion
   */
  async logDelete(userId, resource, resourceId, oldValues) {
    try {
      return await this.log({
        userId,
        action: 'DELETE',
        resource,
        resourceId,
        oldValues
      });
    } catch (error) {
      console.error('Error logging delete:', error);
    }
  }

  /**
   * Log transaction
   */
  async logTransaction(userId, type, amount, metadata = null) {
    try {
      return await this.log({
        userId,
        action: 'TRANSACTION_' + type.toUpperCase(),
        resource: 'payments',
        metadata: {
          type,
          amount,
          ...metadata
        }
      });
    } catch (error) {
      console.error('Error logging transaction:', error);
    }
  }

  /**
   * Get suspicious activities
   */
  async getSuspiciousActivities(filters = {}) {
    try {
      let query = db('audit_logs').where('is_suspicious', true);

      if (filters.startDate) {
        query = query.where('timestamp', '>=', filters.startDate);
      }

      if (filters.endDate) {
        query = query.where('timestamp', '<=', filters.endDate);
      }

      if (filters.userId) {
        query = query.where('user_id', filters.userId);
      }

      const activities = await query
        .orderBy('timestamp', 'desc')
        .limit(filters.limit || 100);

      return activities;
    } catch (error) {
      console.error('Error fetching suspicious activities:', error);
      throw error;
    }
  }

  /**
   * Export audit logs
   */
  async exportLogs(filters = {}, format = 'json') {
    try {
      const logs = await this.getLogs({ ...filters, limit: 10000 });

      if (format === 'csv') {
        return this.convertToCSV(logs.data);
      }

      return logs.data;
    } catch (error) {
      console.error('Error exporting logs:', error);
      throw error;
    }
  }

  /**
   * Convert logs to CSV format
   */
  convertToCSV(logs) {
    const headers = ['ID', 'User ID', 'Action', 'Resource', 'Resource ID', 'Timestamp', 'Suspicious', 'Notes'];
    const rows = logs.map(log => [
      log.id,
      log.user_id || '',
      log.action,
      log.resource,
      log.resource_id || '',
      log.timestamp,
      log.is_suspicious ? 'Yes' : 'No',
      log.notes || ''
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    return csv;
  }
}

module.exports = new AuditService();
