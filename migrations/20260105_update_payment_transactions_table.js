/**
 * Migration: Update Payment Transactions Table
 * Adds payment method tracking columns
 */

exports.up = function(knex) {
  return knex.schema.table('payment_transactions', function(table) {
    // Add only the new columns that don't exist yet
    table.integer('payment_method_id').unsigned().nullable();
    table.string('payment_method_code').nullable();
    table.string('gateway_transaction_id').nullable();
    table.string('reference_number').nullable().unique();
    table.json('gateway_response').nullable();
    table.timestamp('completed_at').nullable();
    table.text('failure_reason').nullable();
    
    // Foreign key if payment_methods table exists
    // table.foreign('payment_method_id').references('payment_methods.id');
  });
};

exports.down = function(knex) {
  return knex.schema.table('payment_transactions', function(table) {
    table.dropColumn('payment_method_id');
    table.dropColumn('payment_method_code');
    table.dropColumn('gateway_transaction_id');
    table.dropColumn('reference_number');
    table.dropColumn('gateway_response');
    table.dropColumn('completed_at');
    table.dropColumn('failure_reason');
  });
};
