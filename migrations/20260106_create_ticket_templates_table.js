/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.hasTable('ticket_templates').then(exists => {
    if (!exists) {
      return knex.schema.createTable('ticket_templates', function(table) {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('organizer_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
        table.string('name', 100).notNullable();
        table.text('description');
        table.enum('ticket_type', ['standard', 'vip', 'premium', 'economy', 'business', 'first_class']).defaultTo('standard');
        table.enum('ticket_format', ['digital', 'physical']).defaultTo('digital');
        table.enum('digital_format', ['qr_code', 'nfc', 'rfid', 'barcode']).defaultTo('qr_code');
        table.decimal('base_price', 10, 2).notNullable();
        table.string('currency', 3).defaultTo('USD');
        table.decimal('service_fee', 10, 2).defaultTo(0);
        table.boolean('is_transferable').defaultTo(false);
        table.boolean('is_refundable').defaultTo(true);
        table.integer('validity_days'); // How many days the ticket is valid
        table.jsonb('seat_restrictions'); // JSON to store seat types this template applies to
        table.jsonb('metadata'); // Additional template data
        table.boolean('is_active').defaultTo(true);
        table.timestamps(true, true);
        table.timestamp('deleted_at'); // Soft delete

        // Indexes
        table.index(['organizer_id', 'is_active']);
        table.index(['created_at']);
      });
    }
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('ticket_templates');
};
