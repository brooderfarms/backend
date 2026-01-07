const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class CommissionService {
  /**
   * Record a commission transaction when a sale is made
   */
  static async recordCommission(vendorId, saleData) {
    try {
      const {
        orderId = null,
        productId = null,
        saleAmount,
        commissionRate = null,
        commissionType = 'percentage'
      } = saleData;

      // Get vendor's commission rate if not provided
      let rate = commissionRate;
      if (!rate) {
        const vendor = await db('vendors').where('id', vendorId).first();
        rate = vendor?.commission_rate || 15;
      }

      // Calculate commission
      const commissionAmount = commissionType === 'percentage' 
        ? (saleAmount * rate) / 100 
        : rate;

      const commission = {
        id: uuidv4(),
        vendor_id: vendorId,
        order_id: orderId,
        product_id: productId,
        sale_amount: saleAmount,
        commission_rate: rate,
        commission_amount: commissionAmount,
        commission_type: commissionType,
        status: 'pending',
        created_at: new Date()
      };

      await db('commission_transactions').insert(commission);

      return commission;
    } catch (error) {
      console.error('Error recording commission:', error);
      throw error;
    }
  }

  /**
   * Get all commissions for a vendor
   */
  static async getVendorCommissions(vendorId, filters = {}) {
    try {
      const { status = 'pending', startDate, endDate } = filters;

      let query = db('commission_transactions')
        .where('vendor_id', vendorId)
        .orderBy('created_at', 'desc');

      if (status) {
        query = query.where('status', status);
      }

      if (startDate) {
        query = query.where('created_at', '>=', startDate);
      }

      if (endDate) {
        query = query.where('created_at', '<=', endDate);
      }

      return await query.select('*');
    } catch (error) {
      console.error('Error fetching commissions:', error);
      throw error;
    }
  }

  /**
   * Calculate vendor's net revenue (sales - commissions)
   */
  static async calculateVendorRevenue(vendorId, startDate, endDate) {
    try {
      const result = await db('commission_transactions')
        .where('vendor_id', vendorId)
        .where('created_at', '>=', startDate)
        .where('created_at', '<=', endDate)
        .sum('sale_amount as totalSales')
        .sum('commission_amount as totalCommissions')
        .first();

      const totalSales = result?.totalSales || 0;
      const totalCommissions = result?.totalCommissions || 0;
      const netRevenue = totalSales - totalCommissions;

      return {
        vendorId,
        period: { start: startDate, end: endDate },
        totalSales,
        totalCommissions,
        netRevenue,
        commissionPercentage: totalSales > 0 ? (totalCommissions / totalSales * 100).toFixed(2) : 0
      };
    } catch (error) {
      console.error('Error calculating vendor revenue:', error);
      throw error;
    }
  }

  /**
   * Generate a payout for vendor
   */
  static async createPayout(vendorId, payoutData) {
    try {
      const {
        periodStart,
        periodEnd,
        grossRevenue,
        totalCommissions,
        paymentMethod = 'bank_transfer',
        notes = ''
      } = payoutData;

      const netRevenue = grossRevenue - totalCommissions;

      const payout = {
        id: uuidv4(),
        vendor_id: vendorId,
        period_start: periodStart,
        period_end: periodEnd,
        gross_revenue: grossRevenue,
        total_commissions: totalCommissions,
        net_revenue: netRevenue,
        status: 'pending',
        payment_method: paymentMethod,
        notes: notes,
        created_at: new Date()
      };

      await db('vendor_payouts').insert(payout);

      // Mark commission transactions as paid
      await db('commission_transactions')
        .where('vendor_id', vendorId)
        .where('created_at', '>=', periodStart)
        .where('created_at', '<=', periodEnd)
        .where('status', 'pending')
        .update({ status: 'paid', paid_at: new Date() });

      return payout;
    } catch (error) {
      console.error('Error creating payout:', error);
      throw error;
    }
  }

  /**
   * Get vendor payout history
   */
  static async getVendorPayouts(vendorId, filters = {}) {
    try {
      const { status, limit = 50, offset = 0 } = filters;

      let query = db('vendor_payouts')
        .where('vendor_id', vendorId)
        .orderBy('created_at', 'desc');

      if (status) {
        query = query.where('status', status);
      }

      const payouts = await query
        .limit(limit)
        .offset(offset);

      const totalCount = await db('vendor_payouts')
        .where('vendor_id', vendorId)
        .count('* as count')
        .first();

      return {
        payouts,
        pagination: {
          limit,
          offset,
          total: totalCount.count
        }
      };
    } catch (error) {
      console.error('Error fetching payouts:', error);
      throw error;
    }
  }

  /**
   * Generate monthly commission report
   */
  static async generateMonthlyReport(vendorId, year, month) {
    try {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      const result = await db('commission_transactions')
        .where('vendor_id', vendorId)
        .where('created_at', '>=', startDate)
        .where('created_at', '<=', endDate)
        .sum('sale_amount as totalSales')
        .sum('commission_amount as totalCommissions')
        .count('* as transactionCount')
        .avg('commission_rate as avgCommissionRate')
        .first();

      const reportData = {
        id: uuidv4(),
        vendor_id: vendorId,
        report_month: new Date(year, month - 1, 1),
        total_sales: result?.totalSales || 0,
        total_commission_charged: result?.totalCommissions || 0,
        transaction_count: result?.transactionCount || 0,
        average_commission_rate: result?.avgCommissionRate || 0,
        report_generated_at: new Date()
      };

      // Upsert the report
      await db('vendor_commission_reports')
        .insert(reportData)
        .onConflict(['vendor_id', 'report_month'])
        .merge();

      return reportData;
    } catch (error) {
      console.error('Error generating report:', error);
      throw error;
    }
  }

  /**
   * Get commission reports for vendor
   */
  static async getCommissionReports(vendorId, limit = 12) {
    try {
      return await db('vendor_commission_reports')
        .where('vendor_id', vendorId)
        .orderBy('report_month', 'desc')
        .limit(limit)
        .select('*');
    } catch (error) {
      console.error('Error fetching reports:', error);
      throw error;
    }
  }
}

module.exports = CommissionService;
