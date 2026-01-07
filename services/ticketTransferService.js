const db = require('../config/database');

/**
 * Ticket Transfer & Refund Service
 * Handles ticket transfers between users and refund processing
 */

/**
 * Initiate a ticket transfer from one user to another
 * @param {number} ticketId - Ticket ID to transfer
 * @param {number} fromUserId - Current ticket owner
 * @param {number} toUserId - New ticket owner user ID
 * @param {string} toEmail - Recipient email (if not existing user)
 * @returns {Object} Transfer request details
 */
async function initiateTransfer(ticketId, fromUserId, toUserId, toEmail = null) {
  try {
    // Verify ticket exists and belongs to fromUser
    const ticket = await db('tickets')
      .select('tickets.*', 'events.title as event_title', 'events.start_date')
      .join('events', 'tickets.event_id', 'events.id')
      .where('tickets.id', ticketId)
      .where('tickets.user_id', fromUserId)
      .where('tickets.deleted_at', null)
      .first();

    if (!ticket) {
      throw new Error('Ticket not found or does not belong to this user');
    }

    // Check ticket is not already transferred/used
    if (ticket.status !== 'active') {
      throw new Error(`Cannot transfer ticket with status: ${ticket.status}`);
    }

    // Check event hasn't started
    if (new Date(ticket.start_date) <= new Date()) {
      throw new Error('Cannot transfer ticket for an event that has already started');
    }

    // Check if toUser exists (if toUserId provided)
    let recipientUserId = toUserId;
    if (toUserId && toUserId !== null) {
      const recipientUser = await db('users')
        .where('id', toUserId)
        .where('deleted_at', null)
        .first();

      if (!recipientUser) {
        throw new Error('Recipient user not found');
      }
    }

    // Create transfer request
    const transfer = await db('ticket_transfers').insert({
      ticket_id: ticketId,
      from_user_id: fromUserId,
      to_user_id: recipientUserId || null,
      to_email: toEmail || null,
      status: 'pending',
      transfer_code: generateTransferCode(),
      requested_at: new Date(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    return {
      transferId: transfer[0],
      ticketId,
      status: 'pending',
      transferCode: await db('ticket_transfers').where('id', transfer[0]).select('transfer_code').first(),
      expiresIn: '7 days'
    };
  } catch (error) {
    throw new Error(`Transfer initiation failed: ${error.message}`);
  }
}

/**
 * Accept a pending ticket transfer
 * @param {number} transferId - Transfer request ID
 * @param {number} toUserId - User accepting the transfer
 * @returns {Object} Updated transfer and ticket details
 */
async function acceptTransfer(transferId, toUserId) {
  try {
    const transfer = await db('ticket_transfers')
      .where('id', transferId)
      .where('status', 'pending')
      .first();

    if (!transfer) {
      throw new Error('Transfer request not found or already processed');
    }

    // Check if transfer has expired
    if (new Date(transfer.expires_at) <= new Date()) {
      await db('ticket_transfers').where('id', transferId).update({ status: 'expired' });
      throw new Error('Transfer request has expired');
    }

    // Verify recipient matches
    if (transfer.to_user_id && transfer.to_user_id !== toUserId) {
      throw new Error('This transfer is not intended for you');
    }

    // Get ticket details
    const ticket = await db('tickets').where('id', transfer.ticket_id).first();
    if (!ticket || ticket.status !== 'active') {
      throw new Error('Ticket is no longer available for transfer');
    }

    // Update transfer status
    await db('ticket_transfers').where('id', transferId).update({
      status: 'accepted',
      accepted_at: new Date(),
      to_user_id: toUserId
    });

    // Update ticket ownership
    await db('tickets').where('id', transfer.ticket_id).update({
      user_id: toUserId,
      transferred_at: new Date(),
      transfer_count: (ticket.transfer_count || 0) + 1
    });

    return {
      transferId,
      ticketId: transfer.ticket_id,
      status: 'accepted',
      previousOwner: transfer.from_user_id,
      newOwner: toUserId,
      acceptedAt: new Date()
    };
  } catch (error) {
    throw new Error(`Transfer acceptance failed: ${error.message}`);
  }
}

/**
 * Decline a pending ticket transfer
 * @param {number} transferId - Transfer request ID
 * @param {number} userId - User declining the transfer
 * @returns {Object} Updated transfer details
 */
async function declineTransfer(transferId, userId) {
  try {
    const transfer = await db('ticket_transfers')
      .where('id', transferId)
      .where('status', 'pending')
      .first();

    if (!transfer) {
      throw new Error('Transfer request not found or already processed');
    }

    // Verify user is authorized to decline
    if (transfer.to_user_id && transfer.to_user_id !== userId && transfer.from_user_id !== userId) {
      throw new Error('Unauthorized to decline this transfer');
    }

    await db('ticket_transfers').where('id', transferId).update({
      status: 'declined',
      declined_at: new Date()
    });

    return {
      transferId,
      status: 'declined',
      declinedAt: new Date()
    };
  } catch (error) {
    throw new Error(`Transfer decline failed: ${error.message}`);
  }
}

/**
 * Process a refund for a ticket
 * @param {number} ticketId - Ticket ID to refund
 * @param {number} userId - User requesting refund
 * @param {string} reason - Refund reason
 * @param {number} refundAmount - Amount to refund (optional, defaults to full price)
 * @returns {Object} Refund details
 */
async function processRefund(ticketId, userId, reason, refundAmount = null) {
  try {
    // Get ticket with payment info
    const ticket = await db('tickets')
      .select('tickets.*', 'events.id as event_id', 'events.start_date', 'payments.id as payment_id', 'payments.amount as paid_amount', 'payments.payment_method')
      .join('events', 'tickets.event_id', 'events.id')
      .leftJoin('payments', 'tickets.payment_id', 'payments.id')
      .where('tickets.id', ticketId)
      .where('tickets.user_id', userId)
      .where('tickets.deleted_at', null)
      .first();

    if (!ticket) {
      throw new Error('Ticket not found or does not belong to this user');
    }

    // Check refund eligibility
    const eventStartTime = new Date(ticket.start_date);
    const now = new Date();
    const hoursUntilEvent = (eventStartTime - now) / (1000 * 60 * 60);

    if (hoursUntilEvent < 24) {
      throw new Error('Refunds are not allowed within 24 hours of event start');
    }

    if (ticket.status === 'used') {
      throw new Error('Cannot refund used tickets');
    }

    if (ticket.status === 'refunded') {
      throw new Error('Ticket already refunded');
    }

    // Calculate refund amount
    const amount = refundAmount || ticket.paid_amount;
    if (amount > ticket.paid_amount) {
      throw new Error('Refund amount cannot exceed original purchase price');
    }

    // Create refund record
    const refund = await db('ticket_refunds').insert({
      ticket_id: ticketId,
      user_id: userId,
      original_amount: ticket.paid_amount,
      refund_amount: amount,
      reason,
      status: 'pending',
      requested_at: new Date(),
      payment_method: ticket.payment_method
    });

    // Update ticket status
    await db('tickets').where('id', ticketId).update({
      status: 'refund_pending'
    });

    // Log audit trail
    await db('audit_logs').insert({
      user_id: userId,
      action: 'REQUEST_REFUND',
      resource_type: 'ticket',
      resource_id: ticketId,
      changes: {
        originalAmount: ticket.paid_amount,
        refundAmount: amount,
        reason
      },
      ip_address: null,
      user_agent: null,
      created_at: new Date()
    });

    return {
      refundId: refund[0],
      ticketId,
      status: 'pending',
      originalAmount: ticket.paid_amount,
      refundAmount: amount,
      reason,
      requestedAt: new Date()
    };
  } catch (error) {
    throw new Error(`Refund processing failed: ${error.message}`);
  }
}

/**
 * Approve a pending refund (admin/organizer)
 * @param {number} refundId - Refund request ID
 * @param {number} approvedBy - User approving refund
 * @returns {Object} Updated refund details
 */
async function approveRefund(refundId, approvedBy) {
  try {
    const refund = await db('ticket_refunds')
      .where('id', refundId)
      .where('status', 'pending')
      .first();

    if (!refund) {
      throw new Error('Refund request not found or already processed');
    }

    // Update refund status
    await db('ticket_refunds').where('id', refundId).update({
      status: 'approved',
      approved_at: new Date(),
      approved_by: approvedBy
    });

    // Update ticket status
    await db('tickets').where('id', refund.ticket_id).update({
      status: 'refunded',
      refunded_at: new Date()
    });

    // Create payment reversal/credit record
    await db('payments').insert({
      user_id: refund.user_id,
      amount: -refund.refund_amount, // Negative amount indicates refund
      currency: 'USD',
      payment_method: refund.payment_method,
      transaction_type: 'refund',
      status: 'completed',
      reference_id: `REFUND-${refundId}`,
      paid_at: new Date()
    });

    return {
      refundId,
      status: 'approved',
      ticketId: refund.ticket_id,
      refundAmount: refund.refund_amount,
      approvedAt: new Date(),
      approvedBy
    };
  } catch (error) {
    throw new Error(`Refund approval failed: ${error.message}`);
  }
}

/**
 * Reject a pending refund (admin/organizer)
 * @param {number} refundId - Refund request ID
 * @param {string} rejectionReason - Reason for rejection
 * @param {number} rejectedBy - User rejecting refund
 * @returns {Object} Updated refund details
 */
async function rejectRefund(refundId, rejectionReason, rejectedBy) {
  try {
    const refund = await db('ticket_refunds')
      .where('id', refundId)
      .where('status', 'pending')
      .first();

    if (!refund) {
      throw new Error('Refund request not found or already processed');
    }

    // Update refund status
    await db('ticket_refunds').where('id', refundId).update({
      status: 'rejected',
      rejection_reason: rejectionReason,
      rejected_at: new Date(),
      rejected_by: rejectedBy
    });

    // Update ticket status back to active
    await db('tickets').where('id', refund.ticket_id).update({
      status: 'active'
    });

    return {
      refundId,
      status: 'rejected',
      rejectionReason,
      rejectedAt: new Date()
    };
  } catch (error) {
    throw new Error(`Refund rejection failed: ${error.message}`);
  }
}

/**
 * Get transfer history for a ticket
 * @param {number} ticketId - Ticket ID
 * @returns {Array} Transfer history records
 */
async function getTransferHistory(ticketId) {
  try {
    const transfers = await db('ticket_transfers')
      .select(
        'ticket_transfers.*',
        'from_user.email as from_email',
        'from_user.first_name as from_first_name',
        'from_user.last_name as from_last_name',
        'to_user.email as to_email',
        'to_user.first_name as to_first_name',
        'to_user.last_name as to_last_name'
      )
      .leftJoin('users as from_user', 'ticket_transfers.from_user_id', 'from_user.id')
      .leftJoin('users as to_user', 'ticket_transfers.to_user_id', 'to_user.id')
      .where('ticket_transfers.ticket_id', ticketId)
      .orderBy('ticket_transfers.requested_at', 'desc');

    return transfers;
  } catch (error) {
    throw new Error(`Failed to fetch transfer history: ${error.message}`);
  }
}

/**
 * Get refund history for a ticket
 * @param {number} ticketId - Ticket ID
 * @returns {Array} Refund history records
 */
async function getRefundHistory(ticketId) {
  try {
    const refunds = await db('ticket_refunds')
      .select(
        'ticket_refunds.*',
        'users.email',
        'users.first_name',
        'users.last_name',
        'approvers.email as approved_by_email',
        'rejectors.email as rejected_by_email'
      )
      .join('users', 'ticket_refunds.user_id', 'users.id')
      .leftJoin('users as approvers', 'ticket_refunds.approved_by', 'approvers.id')
      .leftJoin('users as rejectors', 'ticket_refunds.rejected_by', 'rejectors.id')
      .where('ticket_refunds.ticket_id', ticketId)
      .orderBy('ticket_refunds.requested_at', 'desc');

    return refunds;
  } catch (error) {
    throw new Error(`Failed to fetch refund history: ${error.message}`);
  }
}

/**
 * Get pending transfers for a user
 * @param {number} userId - User ID
 * @param {string} role - User role (incoming/outgoing/all)
 * @returns {Array} Pending transfer records
 */
async function getPendingTransfers(userId, role = 'all') {
  try {
    let query = db('ticket_transfers')
      .select(
        'ticket_transfers.*',
        'tickets.ticket_number',
        'events.title as event_title',
        'events.start_date',
        'from_user.email as from_email',
        'from_user.first_name as from_first_name',
        'to_user.email as to_email',
        'to_user.first_name as to_first_name'
      )
      .join('tickets', 'ticket_transfers.ticket_id', 'tickets.id')
      .join('events', 'tickets.event_id', 'events.id')
      .leftJoin('users as from_user', 'ticket_transfers.from_user_id', 'from_user.id')
      .leftJoin('users as to_user', 'ticket_transfers.to_user_id', 'to_user.id')
      .where('ticket_transfers.status', 'pending');

    if (role === 'incoming') {
      query = query.where('ticket_transfers.to_user_id', userId);
    } else if (role === 'outgoing') {
      query = query.where('ticket_transfers.from_user_id', userId);
    } else {
      query = query.where(function() {
        this.where('ticket_transfers.to_user_id', userId)
          .orWhere('ticket_transfers.from_user_id', userId);
      });
    }

    const transfers = await query.orderBy('ticket_transfers.requested_at', 'desc');
    return transfers;
  } catch (error) {
    throw new Error(`Failed to fetch pending transfers: ${error.message}`);
  }
}

/**
 * Get pending refunds for review (admin/organizer)
 * @param {number} organizerId - Organizer ID (optional filter)
 * @returns {Array} Pending refund records with event info
 */
async function getPendingRefunds(organizerId = null) {
  try {
    let query = db('ticket_refunds')
      .select(
        'ticket_refunds.*',
        'tickets.ticket_number',
        'events.id as event_id',
        'events.title as event_title',
        'events.organizer_id',
        'users.email as user_email',
        'users.first_name',
        'users.last_name'
      )
      .join('tickets', 'ticket_refunds.ticket_id', 'tickets.id')
      .join('events', 'tickets.event_id', 'events.id')
      .join('users', 'ticket_refunds.user_id', 'users.id')
      .where('ticket_refunds.status', 'pending');

    if (organizerId) {
      query = query.where('events.organizer_id', organizerId);
    }

    const refunds = await query.orderBy('ticket_refunds.requested_at', 'asc');
    return refunds;
  } catch (error) {
    throw new Error(`Failed to fetch pending refunds: ${error.message}`);
  }
}

/**
 * Get refund statistics for an event
 * @param {number} eventId - Event ID
 * @returns {Object} Refund statistics
 */
async function getRefundStats(eventId) {
  try {
    const stats = await db('ticket_refunds')
      .select(
        db.raw('COUNT(*) as total_requests'),
        db.raw('SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending_count'),
        db.raw('SUM(CASE WHEN status = "approved" THEN 1 ELSE 0 END) as approved_count'),
        db.raw('SUM(CASE WHEN status = "rejected" THEN 1 ELSE 0 END) as rejected_count'),
        db.raw('SUM(CASE WHEN status = "approved" THEN refund_amount ELSE 0 END) as total_refunded')
      )
      .join('tickets', 'ticket_refunds.ticket_id', 'tickets.id')
      .where('tickets.event_id', eventId)
      .first();

    return {
      totalRequests: parseInt(stats.total_requests) || 0,
      pendingCount: parseInt(stats.pending_count) || 0,
      approvedCount: parseInt(stats.approved_count) || 0,
      rejectedCount: parseInt(stats.rejected_count) || 0,
      totalRefunded: parseFloat(stats.total_refunded) || 0
    };
  } catch (error) {
    throw new Error(`Failed to fetch refund stats: ${error.message}`);
  }
}

/**
 * Generate a unique transfer code
 * @returns {string} Transfer code
 */
function generateTransferCode() {
  return 'TRF' + Math.random().toString(36).substring(2, 8).toUpperCase() + Date.now().toString(36).toUpperCase();
}

module.exports = {
  initiateTransfer,
  acceptTransfer,
  declineTransfer,
  processRefund,
  approveRefund,
  rejectRefund,
  getTransferHistory,
  getRefundHistory,
  getPendingTransfers,
  getPendingRefunds,
  getRefundStats
};
