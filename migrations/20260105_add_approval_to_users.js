/**
 * Migration: Add approval and payment fields to users table
 * Enables organizer/venue manager approval workflow and payment tracking
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    // Approval workflow for organizers and venue managers
    table.enum('approval_status', ['pending', 'approved', 'rejected', 'suspended']).defaultTo('pending').after('role');
    table.string('rejection_reason', 500).after('approval_status');
    table.uuid('approved_by').references('id').inTable('users').onDelete('SET NULL').after('rejection_reason');
    table.timestamp('approved_at').after('approved_by');
    table.timestamp('rejection_at').after('approved_at');

    // Payment information
    table.string('bank_account_number', 100).after('rejection_at');
    table.string('bank_code', 20).after('bank_account_number');
    table.string('bank_name', 100).after('bank_code');
    table.string('account_holder_name', 100).after('bank_name');
    table.enum('payment_verification_status', ['unverified', 'pending', 'verified', 'failed']).defaultTo('unverified').after('account_holder_name');
    table.timestamp('payment_verified_at').after('payment_verification_status');

    // Commission tracking
    table.decimal('commission_percentage', 5, 2).defaultTo(5).after('payment_verified_at'); // Default 5% commission
    table.decimal('total_earnings', 15, 2).defaultTo(0).after('commission_percentage');
    table.decimal('total_payouts', 15, 2).defaultTo(0).after('total_earnings');
    table.decimal('pending_balance', 15, 2).defaultTo(0).after('total_payouts');
    table.decimal('minimum_payout_amount', 10, 2).defaultTo(100).after('pending_balance');

    // Indexes for approval and payment queries
    table.index('approval_status');
    table.index('payment_verification_status');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.dropIndex('approval_status');
    table.dropIndex('payment_verification_status');
    
    table.dropColumn('approval_status');
    table.dropColumn('rejection_reason');
    table.dropColumn('approved_by');
    table.dropColumn('approved_at');
    table.dropColumn('rejection_at');
    table.dropColumn('bank_account_number');
    table.dropColumn('bank_code');
    table.dropColumn('bank_name');
    table.dropColumn('account_holder_name');
    table.dropColumn('payment_verification_status');
    table.dropColumn('payment_verified_at');
    table.dropColumn('commission_percentage');
    table.dropColumn('total_earnings');
    table.dropColumn('total_payouts');
    table.dropColumn('pending_balance');
    table.dropColumn('minimum_payout_amount');
  });
};
