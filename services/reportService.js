const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class ReportService {
  /**
   * Generate sales report
   */
  async generateSalesReport(filters = {}) {
    try {
      const startDate = filters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = filters.endDate || new Date();

      // Total revenue
      const revenueData = await db('payments')
        .where('status', 'completed')
        .where('payment_date', '>=', startDate)
        .where('payment_date', '<=', endDate)
        .sum('amount as total_revenue')
        .avg('amount as avg_transaction')
        .count('* as total_transactions')
        .first();

      // Revenue by gateway
      const revenueByGateway = await db('payments')
        .where('status', 'completed')
        .where('payment_date', '>=', startDate)
        .where('payment_date', '<=', endDate)
        .groupBy('gateway')
        .select('gateway')
        .sum('amount as revenue')
        .count('* as count');

      // Revenue by event
      const revenueByEvent = await db.raw(`
        SELECT e.title as event_title, 
               COUNT(t.id) as tickets_sold,
               SUM(p.amount) as revenue
        FROM events e
        LEFT JOIN tickets t ON e.id = t.event_id
        LEFT JOIN payments p ON t.id = (
          SELECT ticket_id FROM tickets WHERE id = t.id LIMIT 1
        )
        WHERE p.status = 'completed'
        AND p.payment_date >= ?
        AND p.payment_date <= ?
        GROUP BY e.id, e.title
        ORDER BY revenue DESC
      `, [startDate, endDate]);

      // Daily revenue
      const dailyRevenue = await db.raw(`
        SELECT DATE(payment_date) as date,
               SUM(amount) as revenue,
               COUNT(*) as transactions
        FROM payments
        WHERE status = 'completed'
        AND payment_date >= ?
        AND payment_date <= ?
        GROUP BY DATE(payment_date)
        ORDER BY date ASC
      `, [startDate, endDate]);

      return {
        period: { startDate, endDate },
        totalRevenue: parseFloat(revenueData.total_revenue) || 0,
        totalTransactions: revenueData.total_transactions || 0,
        averageTransaction: parseFloat(revenueData.avg_transaction) || 0,
        revenueByGateway: revenueByGateway,
        revenueByEvent: revenueByEvent.rows,
        dailyRevenue: dailyRevenue.rows
      };
    } catch (error) {
      console.error('Error generating sales report:', error);
      throw error;
    }
  }

  /**
   * Generate attendance report
   */
  async generateAttendanceReport(filters = {}) {
    try {
      const startDate = filters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = filters.endDate || new Date();

      // Overall stats
      const stats = await db('tickets')
        .where('purchase_date', '>=', startDate)
        .where('purchase_date', '<=', endDate)
        .whereNull('deleted_at')
        .groupBy(db.raw('1'))
        .select(
          db.raw('COUNT(*) as total_tickets'),
          db.raw('SUM(CASE WHEN status = \'used\' THEN 1 ELSE 0 END) as used_tickets'),
          db.raw('SUM(CASE WHEN status = \'confirmed\' THEN 1 ELSE 0 END) as confirmed_tickets'),
          db.raw('SUM(CASE WHEN status = \'reserved\' THEN 1 ELSE 0 END) as reserved_tickets'),
          db.raw('SUM(CASE WHEN status = \'cancelled\' THEN 1 ELSE 0 END) as cancelled_tickets')
        )
        .first();

      // By event
      const byEvent = await db.raw(`
        SELECT e.title as event_title,
               COUNT(t.id) as total_issued,
               SUM(CASE WHEN t.status = 'used' THEN 1 ELSE 0 END) as attended,
               SUM(CASE WHEN t.status = 'used' THEN 1 ELSE 0 END) * 100.0 / COUNT(t.id) as attendance_rate
        FROM events e
        LEFT JOIN tickets t ON e.id = t.event_id AND t.deleted_at IS NULL
        WHERE e.start_date >= ?
        AND e.start_date <= ?
        GROUP BY e.id, e.title
        ORDER BY e.start_date DESC
      `, [startDate, endDate]);

      // By ticket type
      const byTicketType = await db('tickets')
        .where('purchase_date', '>=', startDate)
        .where('purchase_date', '<=', endDate)
        .whereNull('deleted_at')
        .groupBy('ticket_type')
        .select('ticket_type')
        .count('* as count')
        .sum(db.raw('CASE WHEN status = \'used\' THEN 1 ELSE 0 END as used'));

      return {
        period: { startDate, endDate },
        overallStats: stats,
        byEvent: byEvent.rows,
        byTicketType: byTicketType
      };
    } catch (error) {
      console.error('Error generating attendance report:', error);
      throw error;
    }
  }

  /**
   * Generate fraud report
   */
  async generateFraudReport(filters = {}) {
    try {
      const startDate = filters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = filters.endDate || new Date();

      // Suspicious transactions
      const suspiciousTransactions = await db('payments')
        .where('is_suspicious', true)
        .where('payment_date', '>=', startDate)
        .where('payment_date', '<=', endDate)
        .orderBy('payment_date', 'desc');

      // Fraud by type
      const fraudByType = await db('audit_logs')
        .where('action', 'like', '%FRAUD%')
        .where('timestamp', '>=', startDate)
        .where('timestamp', '<=', endDate)
        .groupBy('action')
        .count('* as count')
        .select('action');

      // High-risk users
      const highRiskUsers = await db.raw(`
        SELECT u.id, u.email, u.first_name, u.last_name,
               COUNT(p.id) as suspicious_payments,
               SUM(p.amount) as total_suspicious_amount
        FROM users u
        LEFT JOIN payments p ON u.id = p.user_id AND p.is_suspicious = true
        WHERE p.payment_date >= ?
        AND p.payment_date <= ?
        GROUP BY u.id, u.email, u.first_name, u.last_name
        HAVING COUNT(p.id) > 0
        ORDER BY COUNT(p.id) DESC
        LIMIT 20
      `, [startDate, endDate]);

      // Chargeback analysis
      const chargebacks = await db('payments')
        .where('status', 'refunded')
        .where('refund_processed_at', '>=', startDate)
        .where('refund_processed_at', '<=', endDate)
        .count('* as chargeback_count')
        .sum('amount as chargeback_amount')
        .first();

      return {
        period: { startDate, endDate },
        totalSuspiciousTransactions: suspiciousTransactions.length,
        suspiciousTransactions: suspiciousTransactions.slice(0, 50), // Top 50
        fraudByType: fraudByType,
        highRiskUsers: highRiskUsers.rows,
        chargebacks: chargebacks
      };
    } catch (error) {
      console.error('Error generating fraud report:', error);
      throw error;
    }
  }

  /**
   * Generate user report
   */
  async generateUserReport(filters = {}) {
    try {
      const startDate = filters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = filters.endDate || new Date();

      // User stats
      const userStats = await db('users')
        .where('created_at', '>=', startDate)
        .where('created_at', '<=', endDate)
        .whereNull('deleted_at')
        .groupBy(db.raw('1'))
        .select(
          db.raw('COUNT(*) as new_users'),
          db.raw('SUM(CASE WHEN email_verified = true THEN 1 ELSE 0 END) as verified_email'),
          db.raw('SUM(CASE WHEN phone_verified = true THEN 1 ELSE 0 END) as verified_phone'),
          db.raw('SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active_users')
        )
        .first();

      // By role
      const byRole = await db('users')
        .where('created_at', '>=', startDate)
        .where('created_at', '<=', endDate)
        .whereNull('deleted_at')
        .groupBy('role')
        .select('role')
        .count('* as count');

      // Top customers by spending
      const topCustomers = await db.raw(`
        SELECT u.id, u.email, u.first_name, u.last_name,
               COUNT(p.id) as total_purchases,
               SUM(p.amount) as total_spent,
               AVG(p.amount) as avg_purchase
        FROM users u
        LEFT JOIN payments p ON u.id = p.user_id AND p.status = 'completed'
        WHERE p.payment_date >= ?
        AND p.payment_date <= ?
        GROUP BY u.id, u.email, u.first_name, u.last_name
        ORDER BY SUM(p.amount) DESC
        LIMIT 20
      `, [startDate, endDate]);

      return {
        period: { startDate, endDate },
        overallStats: userStats,
        byRole: byRole,
        topCustomers: topCustomers.rows
      };
    } catch (error) {
      console.error('Error generating user report:', error);
      throw error;
    }
  }

  /**
   * Generate event performance report
   */
  async generateEventPerformanceReport(eventId) {
    try {
      const event = await db('events').where('id', eventId).first();

      if (!event) {
        throw new Error('Event not found');
      }

      // Sales metrics
      const sales = await db('tickets')
        .where('event_id', eventId)
        .whereNull('deleted_at')
        .groupBy(db.raw('1'))
        .select(
          db.raw('COUNT(*) as total_sold'),
          db.raw('SUM(total_amount) as total_revenue'),
          db.raw('AVG(total_amount) as avg_ticket_price')
        )
        .first();

      // By ticket type
      const byTicketType = await db('tickets')
        .where('event_id', eventId)
        .whereNull('deleted_at')
        .groupBy('ticket_type')
        .select('ticket_type')
        .count('* as count')
        .sum('total_amount as revenue');

      // Attendance rate
      const attendance = await db('tickets')
        .where('event_id', eventId)
        .whereNull('deleted_at')
        .groupBy(db.raw('1'))
        .select(
          db.raw('SUM(CASE WHEN status = \'used\' THEN 1 ELSE 0 END) as attended'),
          db.raw('COUNT(*) as issued'),
          db.raw('SUM(CASE WHEN status = \'used\' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as attendance_rate')
        )
        .first();

      return {
        eventId: eventId,
        eventTitle: event.title,
        eventDate: event.start_date,
        salesMetrics: sales,
        byTicketType: byTicketType,
        attendance: attendance
      };
    } catch (error) {
      console.error('Error generating event performance report:', error);
      throw error;
    }
  }

  /**
   * Generate organizer revenue report
   */
  async generateOrganizerReport(organizerId, filters = {}) {
    try {
      const startDate = filters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = filters.endDate || new Date();

      // Total revenue
      const revenue = await db.raw(`
        SELECT SUM(p.amount) as total_revenue,
               COUNT(p.id) as total_transactions,
               AVG(p.amount) as avg_transaction
        FROM payments p
        LEFT JOIN tickets t ON p.user_id = t.user_id
        LEFT JOIN events e ON t.event_id = e.id
        WHERE e.organizer_id = ?
        AND p.status = 'completed'
        AND p.payment_date >= ?
        AND p.payment_date <= ?
      `, [organizerId, startDate, endDate]);

      // Events created
      const events = await db('events')
        .where('organizer_id', organizerId)
        .where('created_at', '>=', startDate)
        .where('created_at', '<=', endDate)
        .whereNull('deleted_at')
        .count('* as count')
        .first();

      // Event performance
      const eventPerformance = await db.raw(`
        SELECT e.id, e.title, 
               COUNT(t.id) as tickets_sold,
               SUM(p.amount) as revenue,
               SUM(CASE WHEN t.status = 'used' THEN 1 ELSE 0 END) as attendance
        FROM events e
        LEFT JOIN tickets t ON e.id = t.event_id AND t.deleted_at IS NULL
        LEFT JOIN payments p ON t.id = (
          SELECT ticket_id FROM tickets WHERE id = t.id LIMIT 1
        ) AND p.status = 'completed'
        WHERE e.organizer_id = ?
        AND e.created_at >= ?
        AND e.created_at <= ?
        GROUP BY e.id, e.title
        ORDER BY revenue DESC
      `, [organizerId, startDate, endDate]);

      return {
        period: { startDate, endDate },
        totalRevenue: parseFloat(revenue.rows[0]?.total_revenue) || 0,
        totalTransactions: revenue.rows[0]?.total_transactions || 0,
        averageTransaction: parseFloat(revenue.rows[0]?.avg_transaction) || 0,
        eventsCreated: events.count || 0,
        eventPerformance: eventPerformance.rows
      };
    } catch (error) {
      console.error('Error generating organizer report:', error);
      throw error;
    }
  }

  /**
   * Export report to CSV
   */
  async exportReportAsCSV(reportData, reportType) {
    try {
      let csv = '';

      if (reportType === 'sales') {
        csv = this.salesReportToCSV(reportData);
      } else if (reportType === 'attendance') {
        csv = this.attendanceReportToCSV(reportData);
      } else if (reportType === 'fraud') {
        csv = this.fraudReportToCSV(reportData);
      } else if (reportType === 'user') {
        csv = this.userReportToCSV(reportData);
      }

      return csv;
    } catch (error) {
      console.error('Error exporting report:', error);
      throw error;
    }
  }

  /**
   * Helper: Sales report to CSV
   */
  salesReportToCSV(data) {
    let csv = 'Sales Report\n';
    csv += `Period: ${data.period.startDate} to ${data.period.endDate}\n\n`;
    csv += `Total Revenue,${data.totalRevenue}\n`;
    csv += `Total Transactions,${data.totalTransactions}\n`;
    csv += `Average Transaction,${data.averageTransaction}\n\n`;

    csv += 'Revenue by Gateway\n';
    csv += 'Gateway,Revenue,Count\n';
    data.revenueByGateway.forEach(row => {
      csv += `${row.gateway},${row.revenue},${row.count}\n`;
    });

    csv += '\nDaily Revenue\n';
    csv += 'Date,Revenue,Transactions\n';
    data.dailyRevenue.forEach(row => {
      csv += `${row.date},${row.revenue},${row.transactions}\n`;
    });

    return csv;
  }

  /**
   * Helper: Attendance report to CSV
   */
  attendanceReportToCSV(data) {
    let csv = 'Attendance Report\n';
    csv += `Period: ${data.period.startDate} to ${data.period.endDate}\n\n`;
    csv += `Total Tickets,${data.overallStats.total_tickets}\n`;
    csv += `Used,${data.overallStats.used_tickets}\n`;
    csv += `Confirmed,${data.overallStats.confirmed_tickets}\n`;
    csv += `Reserved,${data.overallStats.reserved_tickets}\n\n`;

    csv += 'By Event\n';
    csv += 'Event,Total Issued,Attended,Attendance Rate\n';
    data.byEvent.forEach(row => {
      csv += `"${row.event_title}",${row.total_issued},${row.attended},${row.attendance_rate}%\n`;
    });

    return csv;
  }

  /**
   * Helper: Fraud report to CSV
   */
  fraudReportToCSV(data) {
    let csv = 'Fraud Report\n';
    csv += `Period: ${data.period.startDate} to ${data.period.endDate}\n\n`;
    csv += `Suspicious Transactions,${data.totalSuspiciousTransactions}\n`;
    csv += `Chargebacks,${data.chargebacks.chargeback_count}\n`;
    csv += `Chargeback Amount,${data.chargebacks.chargeback_amount}\n\n`;

    csv += 'High Risk Users\n';
    csv += 'Email,Suspicious Payments,Total Amount\n';
    data.highRiskUsers.forEach(row => {
      csv += `${row.email},${row.suspicious_payments},${row.total_suspicious_amount}\n`;
    });

    return csv;
  }

  /**
   * Helper: User report to CSV
   */
  userReportToCSV(data) {
    let csv = 'User Report\n';
    csv += `Period: ${data.period.startDate} to ${data.period.endDate}\n\n`;
    csv += `New Users,${data.overallStats.new_users}\n`;
    csv += `Verified Email,${data.overallStats.verified_email}\n`;
    csv += `Verified Phone,${data.overallStats.verified_phone}\n\n`;

    csv += 'By Role\n';
    csv += 'Role,Count\n';
    data.byRole.forEach(row => {
      csv += `${row.role},${row.count}\n`;
    });

    csv += '\nTop Customers\n';
    csv += 'Email,Total Purchases,Total Spent,Avg Purchase\n';
    data.topCustomers.forEach(row => {
      csv += `${row.email},${row.total_purchases},${row.total_spent},${row.avg_purchase}\n`;
    });

    return csv;
  }
}

module.exports = new ReportService();
