/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('seats', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('event_id').references('id').inTable('events').onDelete('CASCADE');
    table.string('seat_number', 20).notNullable();
    table.string('seat_row', 10).notNullable();
    table.string('seat_section', 50).notNullable();
    table.enum('seat_type', ['standard', 'vip', 'premium', 'accessible', 'box', 'standing']).defaultTo('standard');
    table.decimal('price', 10, 2);
    table.enum('status', ['available', 'reserved', 'sold', 'blocked', 'maintenance']).defaultTo('available');
    table.uuid('reserved_by'); // User who reserved the seat
    table.timestamp('reserved_at');
    table.timestamp('reservation_expires_at');
    table.uuid('ticket_id').references('id').inTable('tickets').onDelete('SET NULL');
    table.integer('x_coordinate'); // For seat map positioning
    table.integer('y_coordinate'); // For seat map positioning
    table.jsonb('attributes'); // Additional seat attributes (aisle, window, etc.)
    table.timestamps(true, true);

    // Ensure unique seats per event
    table.unique(['event_id', 'seat_number', 'seat_row', 'seat_section']);
    // Indexes for performance
    table.index(['venue_id', 'status']);
    table.index(['event_id', 'status']);
    table.index(['status', 'reserved_at']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('seats');
};
