/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('payments', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.uuid('event_id').references('id').inTable('events').onDelete('SET NULL');
    table.string('transaction_id', 255).unique();
    table.enum('payment_method', ['stripe', 'paypal', 'zim_gateway', 'mastercard', 'visa', 'bank_transfer', 'cash']).notNullable();
    table.enum('gateway', ['stripe', 'paypal', 'zim_gateway', 'other']).notNullable();
    table.string('gateway_transaction_id', 255);
    table.string('reference_number', 100).unique().notNullable();
    table.decimal('amount', 10, 2).notNullable();
    table.string('currency', 3).defaultTo('USD');
    table.decimal('gateway_fee', 10, 2).defaultTo(0);
    table.decimal('service_fee', 10, 2).defaultTo(0);
    table.decimal('total_amount', 10, 2).notNullable();
    table.enum('status', ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded']).defaultTo('pending');
    table.text('failure_reason');
    table.timestamp('payment_date');
    table.timestamp('completed_at');
    table.timestamp('failed_at');
    table.boolean('is_refundable').defaultTo(true);
    table.decimal('refunded_amount', 10, 2).defaultTo(0);
    table.timestamp('refund_requested_at');
    table.timestamp('refund_processed_at');
    table.text('refund_reason');
    table.jsonb('gateway_response'); // Store full gateway response
    table.jsonb('metadata'); // Additional payment data
    table.string('ip_address', 45);
    table.string('user_agent', 500);
    table.boolean('is_suspicious').defaultTo(false);
    table.text('fraud_flags'); // JSON string of fraud detection flags
    table.timestamps(true, true);
    table.timestamp('deleted_at'); // Soft delete

    // Indexes for performance
    table.index(['user_id', 'status']);
    table.index(['transaction_id']);
    table.index(['reference_number']);
    table.index(['status', 'payment_date']);
    table.index(['gateway', 'status']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('payments');
};
