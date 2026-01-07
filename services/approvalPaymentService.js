const db = require('../config/database');
const auditService = require('./auditService');

/**
 * Approval and Payment Service
 * Handles organizer/venue manager approval workflows and payment management
 */
class ApprovalPaymentService {
  /**
   * Get all pending organizers/venue managers for approval
   * @param {string} role - 'organizer' or 'venue_manager'
   * @param {object} filters - Query filters (approval_status, etc.)
   * @returns {Promise<Array>}
   */
  async getPendingApprovals(role = null, filters = {}) {
    try {
      let query = db('users')
        .select(
          'id',
          'email',
          'first_name',
          'last_name',
          'role',
          'approval_status',
          'created_at',
          'rejection_reason',
          'approved_at'
        )
        .whereIn('approval_status', ['pending', 'rejected'])
        .where('is_active', true);

      if (role) {
        query = query.where('role', role);
      } else {
        query = query.whereIn('role', ['organizer', 'venue_manager']);
      }

      // Apply additional filters
      if (filters.approval_status) {
        query = query.where('approval_status', filters.approval_status);
      }

      if (filters.createdAfter) {
        query = query.where('created_at', '>=', filters.createdAfter);
      }

      const users = await query.orderBy('created_at', 'desc');
      return users;
    } catch (error) {
      throw new Error(`Failed to fetch pending approvals: ${error.message}`);
    }
  }

  /**
   * Get single pending approval details
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  async getApprovalDetails(userId) {
    try {
      const user = await db('users')
        .where('id', userId)
        .whereIn('role', ['organizer', 'venue_manager'])
        .first();

      if (!user) {
        throw new Error('User not found');
      }

      // Get additional info for organizers/venue managers
      let additionalInfo = {};
      if (user.role === 'organizer') {
        additionalInfo.eventCount = await db('events')
          .where('organizer_id', userId)
          .where('deleted_at', null)
          .count('* as count')
          .first();
      } else if (user.role === 'venue_manager') {
        additionalInfo.venueCount = await db('venues')
          .where('manager_id', userId)
          .where('deleted_at', null)
          .count('* as count')
          .first();
      }

      return { ...user, ...additionalInfo };
    } catch (error) {
      throw new Error(`Failed to fetch approval details: ${error.message}`);
    }
  }

  /**
   * Approve an organizer or venue manager
   * @param {string} userId - User to approve
   * @param {string} approvedBy - Admin user ID
   * @param {object} options - Additional options (commission_percentage, etc.)
   * @returns {Promise<Object>}
   */
  async approveUser(userId, approvedBy, options = {}) {
    try {
      // Verify user exists and needs approval
      const user = await db('users').where('id', userId).first();
      if (!user) throw new Error('User not found');
      if (!['organizer', 'venue_manager'].includes(user.role)) {
        throw new Error('Only organizers and venue managers can be approved');
      }

      // Update user approval
      const updateData = {
        approval_status: 'approved',
        approved_by: approvedBy,
        approved_at: new Date(),
        rejection_reason: null,
        rejection_at: null
      };

      // Apply custom commission if provided
      if (options.commission_percentage) {
        updateData.commission_percentage = options.commission_percentage;
      }

      await db('users').where('id', userId).update(updateData);

      // Log action
      await auditService.log({
        userId: approvedBy,
        action: 'APPROVE_USER',
        resource: 'users',
        resourceId: userId,
        newValues: { 
          approval_status: 'approved',
          commission_percentage: options.commission_percentage || user.commission_percentage
        }
      });

      return this.getApprovalDetails(userId);
    } catch (error) {
      throw new Error(`Failed to approve user: ${error.message}`);
    }
  }

  /**
   * Reject an organizer or venue manager
   * @param {string} userId - User to reject
   * @param {string} rejectedBy - Admin user ID
   * @param {string} reason - Rejection reason
   * @returns {Promise<Object>}
   */
  async rejectUser(userId, rejectedBy, reason) {
    try {
      const user = await db('users').where('id', userId).first();
      if (!user) throw new Error('User not found');
      if (!['organizer', 'venue_manager'].includes(user.role)) {
        throw new Error('Only organizers and venue managers can be rejected');
      }

      await db('users').where('id', userId).update({
        approval_status: 'rejected',
        rejection_reason: reason,
        rejection_at: new Date()
      });

      // Log action
      await auditService.log({
        userId: rejectedBy,
        action: 'REJECT_USER',
        resource: 'users',
        resourceId: userId,
        newValues: { approval_status: 'rejected', rejection_reason: reason }
      });

      return this.getApprovalDetails(userId);
    } catch (error) {
      throw new Error(`Failed to reject user: ${error.message}`);
    }
  }

  /**
   * Suspend an approved user
   * @param {string} userId - User to suspend
   * @param {string} suspendedBy - Admin user ID
   * @param {string} reason - Suspension reason
   * @returns {Promise<Object>}
   */
  async suspendUser(userId, suspendedBy, reason) {
    try {
      const user = await db('users').where('id', userId).first();
      if (!user) throw new Error('User not found');

      await db('users').where('id', userId).update({
        approval_status: 'suspended',
        rejection_reason: reason,
        rejection_at: new Date()
      });

      // Log action
      await auditService.log({
        userId: suspendedBy,
        action: 'SUSPEND_USER',
        resource: 'users',
        resourceId: userId,
        newValues: { approval_status: 'suspended', reason }
      });

      return this.getApprovalDetails(userId);
    } catch (error) {
      throw new Error(`Failed to suspend user: ${error.message}`);
    }
  }

  /**
   * Update payment information for a user
   * @param {string} userId - User ID
   * @param {object} paymentInfo - Bank details (accountNumber, bankCode, bankName, accountHolderName)
   * @returns {Promise<Object>}
   */
  async updatePaymentInfo(userId, paymentInfo) {
    try {
      const user = await db('users').where('id', userId).first();
      if (!user) throw new Error('User not found');
      if (!['organizer', 'venue_manager'].includes(user.role)) {
        throw new Error('Payment info can only be updated for organizers and venue managers');
      }

      const updateData = {
        payment_verification_status: 'pending',
        payment_method: paymentInfo.payment_method
      };

      // Update based on payment method
      if (paymentInfo.payment_method === 'bank') {
        updateData.bank_account_number = paymentInfo.accountNumber;
        updateData.bank_code = paymentInfo.bankCode;
        updateData.bank_name = paymentInfo.bankName;
        updateData.account_holder_name = paymentInfo.accountHolderName;
        updateData.ecocash_number = null;
        updateData.innbucks_number = null;
        updateData.cash_pickup_location = null;
        updateData.cash_pickup_details = null;
      } else if (paymentInfo.payment_method === 'ecocash') {
        updateData.ecocash_number = paymentInfo.ecocashNumber;
        updateData.bank_account_number = null;
        updateData.bank_code = null;
        updateData.bank_name = null;
        updateData.account_holder_name = null;
        updateData.innbucks_number = null;
        updateData.cash_pickup_location = null;
        updateData.cash_pickup_details = null;
      } else if (paymentInfo.payment_method === 'innbucks') {
        updateData.innbucks_number = paymentInfo.innbucksNumber;
        updateData.bank_account_number = null;
        updateData.bank_code = null;
        updateData.bank_name = null;
        updateData.account_holder_name = null;
        updateData.ecocash_number = null;
        updateData.cash_pickup_location = null;
        updateData.cash_pickup_details = null;
      } else if (paymentInfo.payment_method === 'cash') {
        updateData.cash_pickup_location = paymentInfo.cashPickupLocation;
        updateData.cash_pickup_details = paymentInfo.cashPickupDetails;
        updateData.bank_account_number = null;
        updateData.bank_code = null;
        updateData.bank_name = null;
        updateData.account_holder_name = null;
        updateData.ecocash_number = null;
        updateData.innbucks_number = null;
      }

      await db('users').where('id', userId).update(updateData);

      // Log action
      await auditService.log({
        userId,
        action: 'UPDATE_PAYMENT_INFO',
        resource: 'payment_info',
        resourceId: userId,
        newValues: { payment_verification_status: 'pending', payment_method: paymentInfo.payment_method }
      });

      return this.getPaymentInfo(userId);
    } catch (error) {
      throw new Error(`Failed to update payment info: ${error.message}`);
    }
  }

  /**
   * Get payment information for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  async getPaymentInfo(userId) {
    try {
      const user = await db('users')
        .where('id', userId)
        .select(
          'id',
          'bank_account_number',
          'bank_code',
          'bank_name',
          'account_holder_name',
          'payment_verification_status',
          'payment_verified_at',
          'commission_percentage',
          'total_earnings',
          'total_payouts',
          'pending_balance',
          'minimum_payout_amount'
        )
        .first();

      if (!user) throw new Error('User not found');
      return user;
    } catch (error) {
      throw new Error(`Failed to fetch payment info: ${error.message}`);
    }
  }

  /**
   * Verify payment information
   * @param {string} userId - User ID
   * @param {string} verifiedBy - Admin user ID
   * @param {boolean} approved - Verification result
   * @param {string} reason - Optional reason for rejection
   * @returns {Promise<Object>}
   */
  async verifyPaymentInfo(userId, verifiedBy, approved, reason = null) {
    try {
      const updateData = {
        payment_verification_status: approved ? 'verified' : 'failed',
        payment_verified_at: new Date()
      };

      if (!approved && reason) {
        updateData.rejection_reason = reason;
      }

      await db('users').where('id', userId).update(updateData);

      // Log action
      await auditService.log({
        userId: verifiedBy,
        action: 'VERIFY_PAYMENT_INFO',
        resource: 'payment_info',
        resourceId: userId,
        newValues: { 
          payment_verification_status: approved ? 'verified' : 'failed',
          reason
        }
      });

      return this.getPaymentInfo(userId);
    } catch (error) {
      throw new Error(`Failed to verify payment info: ${error.message}`);
    }
  }

  /**
   * Request a payout
   * @param {string} userId - Organizer/venue manager ID
   * @param {object} payoutData - Payout details
   * @returns {Promise<Object>}
   */
  async requestPayout(userId, payoutData) {
    try {
      const user = await db('users').where('id', userId).first();
      if (!user) throw new Error('User not found');
      if (!['organizer', 'venue_manager'].includes(user.role)) {
        throw new Error('Only organizers and venue managers can request payouts');
      }

      // Check payment verification
      if (user.payment_verification_status !== 'verified') {
        throw new Error('Payment information must be verified before requesting payouts');
      }

      // Validate amount
      if (payoutData.amount < user.minimum_payout_amount) {
        throw new Error(`Minimum payout amount is ${user.minimum_payout_amount}`);
      }

      if (payoutData.amount > user.pending_balance) {
        throw new Error('Payout amount exceeds available balance');
      }

      // Create payout record
      const payout = await db('payouts').insert({
        user_id: userId,
        amount: payoutData.amount,
        currency: payoutData.currency || 'USD',
        status: 'pending',
        payment_method: payoutData.paymentMethod || 'bank_transfer',
        notes: payoutData.notes,
        period_start: payoutData.periodStart,
        period_end: payoutData.periodEnd,
        metadata: payoutData.metadata || {}
      });

      // Log action
      await auditService.log({
        userId,
        action: 'REQUEST_PAYOUT',
        resource: 'payout',
        resourceId: payout[0],
        newValues: { amount: payoutData.amount, status: 'pending' }
      });

      return this.getPayoutDetails(payout[0]);
    } catch (error) {
      throw new Error(`Failed to request payout: ${error.message}`);
    }
  }

  /**
   * Get payout details
   * @param {string} payoutId - Payout ID
   * @returns {Promise<Object>}
   */
  async getPayoutDetails(payoutId) {
    try {
      const payout = await db('payouts')
        .where('id', payoutId)
        .first();

      if (!payout) throw new Error('Payout not found');
      return payout;
    } catch (error) {
      throw new Error(`Failed to fetch payout details: ${error.message}`);
    }
  }

  /**
   * Get user's payout history
   * @param {string} userId - User ID
   * @param {object} filters - Query filters (status, startDate, endDate)
   * @returns {Promise<Array>}
   */
  async getPayoutHistory(userId, filters = {}) {
    try {
      let query = db('payouts')
        .where('user_id', userId)
        .where('deleted_at', null)
        .orderBy('created_at', 'desc');

      if (filters.status) {
        query = query.where('status', filters.status);
      }

      if (filters.startDate) {
        query = query.where('created_at', '>=', filters.startDate);
      }

      if (filters.endDate) {
        query = query.where('created_at', '<=', filters.endDate);
      }

      const payouts = await query;
      return payouts;
    } catch (error) {
      throw new Error(`Failed to fetch payout history: ${error.message}`);
    }
  }

  /**
   * Approve a payout request
   * @param {string} payoutId - Payout ID
   * @param {string} approvedBy - Admin user ID
   * @returns {Promise<Object>}
   */
  async approvePayout(payoutId, approvedBy) {
    try {
      const payout = await db('payouts').where('id', payoutId).first();
      if (!payout) throw new Error('Payout not found');
      if (payout.status !== 'pending') {
        throw new Error(`Cannot approve payout with status: ${payout.status}`);
      }

      await db('payouts').where('id', payoutId).update({
        status: 'approved',
        approved_by: approvedBy,
        approved_at: new Date()
      });

      // Log action
      await auditService.log({
        userId: approvedBy,
        action: 'APPROVE_PAYOUT',
        resource: 'payout',
        resourceId: payoutId,
        newValues: { status: 'approved' }
      });

      return this.getPayoutDetails(payoutId);
    } catch (error) {
      throw new Error(`Failed to approve payout: ${error.message}`);
    }
  }

  /**
   * Reject a payout request
   * @param {string} payoutId - Payout ID
   * @param {string} rejectedBy - Admin user ID
   * @param {string} reason - Rejection reason
   * @returns {Promise<Object>}
   */
  async rejectPayout(payoutId, rejectedBy, reason) {
    try {
      const payout = await db('payouts').where('id', payoutId).first();
      if (!payout) throw new Error('Payout not found');
      if (payout.status !== 'pending' && payout.status !== 'approved') {
        throw new Error(`Cannot reject payout with status: ${payout.status}`);
      }

      await db('payouts').where('id', payoutId).update({
        status: 'rejected',
        rejection_reason: reason,
        rejected_at: new Date()
      });

      // Log action
      await auditService.log({
        userId: rejectedBy,
        action: 'REJECT_PAYOUT',
        resource: 'payout',
        resourceId: payoutId,
        newValues: { status: 'rejected', reason }
      });

      return this.getPayoutDetails(payoutId);
    } catch (error) {
      throw new Error(`Failed to reject payout: ${error.message}`);
    }
  }

  /**
   * Mark payout as processing
   * @param {string} payoutId - Payout ID
   * @returns {Promise<Object>}
   */
  async processPayout(payoutId) {
    try {
      await db('payouts').where('id', payoutId).update({
        status: 'processing',
        processed_at: new Date()
      });

      return this.getPayoutDetails(payoutId);
    } catch (error) {
      throw new Error(`Failed to process payout: ${error.message}`);
    }
  }

  /**
   * Mark payout as completed
   * @param {string} payoutId - Payout ID
   * @param {string} transactionId - Gateway transaction ID
   * @returns {Promise<Object>}
   */
  async completePayout(payoutId, transactionId) {
    try {
      const payout = await db('payouts').where('id', payoutId).first();
      if (!payout) throw new Error('Payout not found');

      await db('payouts').where('id', payoutId).update({
        status: 'completed',
        transaction_id: transactionId,
        completed_at: new Date()
      });

      // Update user's total payouts
      await db('users')
        .where('id', payout.user_id)
        .increment('total_payouts', payout.amount)
        .decrement('pending_balance', payout.amount);

      return this.getPayoutDetails(payoutId);
    } catch (error) {
      throw new Error(`Failed to complete payout: ${error.message}`);
    }
  }

  /**
   * Update user earnings when payment is completed
   * @param {string} userId - Organizer/venue manager ID
   * @param {number} amount - Amount earned
   * @param {string} source - Source of earnings (ticket_sale, season_pass, etc.)
   * @returns {Promise<void>}
   */
  async addEarnings(userId, amount, source = 'ticket_sale') {
    try {
      const user = await db('users').where('id', userId).first();
      if (!user) throw new Error('User not found');

      const commission = (amount * user.commission_percentage) / 100;
      const netAmount = amount - commission;

      await db('users')
        .where('id', userId)
        .increment({
          total_earnings: amount,
          pending_balance: netAmount
        });

      // Log earning
      await auditService.log({
        userId,
        action: 'ADD_EARNINGS',
        resource: 'earnings',
        resourceId: userId,
        newValues: { 
          amount,
          commission,
          netAmount,
          source
        }
      });
    } catch (error) {
      throw new Error(`Failed to add earnings: ${error.message}`);
    }
  }

  /**
   * Get approval statistics
   * @returns {Promise<Object>}
   */
  async getApprovalStats() {
    try {
      const stats = await db('users')
        .whereIn('role', ['organizer', 'venue_manager'])
        .select('approval_status')
        .count('* as count')
        .groupBy('approval_status');

      const result = {
        pending: 0,
        approved: 0,
        rejected: 0,
        suspended: 0
      };

      stats.forEach(stat => {
        result[stat.approval_status] = parseInt(stat.count);
      });

      return result;
    } catch (error) {
      throw new Error(`Failed to fetch approval stats: ${error.message}`);
    }
  }
}

module.exports = new ApprovalPaymentService();
