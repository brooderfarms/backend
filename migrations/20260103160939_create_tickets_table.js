/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('tickets', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('event_id').references('id').inTable('events').onDelete('CASCADE');
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('ticket_number', 50).unique().notNullable();
    table.enum('ticket_type', ['standard', 'vip', 'premium', 'economy', 'business', 'first_class']).defaultTo('standard');
    table.enum('ticket_format', ['digital', 'physical']).defaultTo('digital');
    table.enum('digital_format', ['qr_code', 'nfc', 'rfid', 'barcode']).defaultTo('qr_code');
    table.string('seat_number', 20);
    table.string('seat_row', 10);
    table.string('seat_section', 50);
    table.decimal('price', 10, 2).notNullable();
    table.string('currency', 3).defaultTo('USD');
    table.decimal('service_fee', 10, 2).defaultTo(0);
    table.decimal('total_amount', 10, 2).notNullable();
    table.enum('status', ['reserved', 'confirmed', 'cancelled', 'refunded', 'used', 'expired']).defaultTo('reserved');
    table.timestamp('purchase_date').defaultTo(knex.fn.now());
    table.timestamp('valid_until');
    table.boolean('is_transferable').defaultTo(false);
    table.uuid('transferred_from');
    table.timestamp('transferred_at');
    table.boolean('is_refundable').defaultTo(true);
    table.timestamp('refund_requested_at');
    table.timestamp('refund_processed_at');
    table.decimal('refund_amount', 10, 2);
    table.text('refund_reason');
    table.jsonb('metadata'); // Additional ticket data
    table.string('qr_code_data', 500);
    table.string('nfc_data', 500);
    table.string('rfid_data', 500);
    table.boolean('email_sent').defaultTo(false);
    table.timestamp('email_sent_at');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    table.timestamp('deleted_at'); // Soft delete

    // Indexes for performance
    table.index(['event_id', 'status']);
    table.index(['user_id', 'status']);
    table.index(['ticket_number']);
    table.index(['status', 'purchase_date']);
    table.unique(['event_id', 'seat_number', 'seat_row', 'seat_section']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('tickets');
};
