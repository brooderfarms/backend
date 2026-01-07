/**
 * Migration: Create organizer payouts table
 * Tracks payout requests and history for organizers and venue managers
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('payouts', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.decimal('amount', 15, 2).notNullable();
    table.string('currency', 3).defaultTo('USD');
    table.enum('status', ['pending', 'approved', 'processing', 'completed', 'failed', 'rejected']).defaultTo('pending');
    table.string('transaction_id', 255).unique();
    table.text('notes');
    table.text('rejection_reason');
    
    // Approval tracking
    table.uuid('approved_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('approved_at');
    table.timestamp('rejected_at');
    table.timestamp('processed_at');
    table.timestamp('completed_at');
    
    // Payment method
    table.enum('payment_method', ['bank_transfer', 'mobile_money', 'check', 'wallet']).defaultTo('bank_transfer');
    table.string('payment_reference', 255);
    
    // Period info
    table.date('period_start');
    table.date('period_end');
    
    // Metadata
    table.jsonb('metadata'); // Can store earning breakdown, deductions, etc.
    
    table.timestamps(true, true);
    table.timestamp('deleted_at');
    
    // Indexes
    table.index('user_id');
    table.index('status');
    table.index('created_at');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('payouts');
};
