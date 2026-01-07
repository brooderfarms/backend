/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('venues', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 255).notNullable();
    table.text('description');
    table.text('address').notNullable();
    table.string('city', 100).notNullable();
    table.string('state', 100);
    table.string('country', 100).defaultTo('Zimbabwe');
    table.string('postal_code', 20);
    table.decimal('latitude', 10, 8);
    table.decimal('longitude', 11, 8);
    table.integer('capacity').notNullable();
    table.enum('venue_type', ['stadium', 'theater', 'arena', 'concert_hall', 'sports_complex', 'conference_center', 'airport', 'bus_station', 'other']).notNullable();
    table.jsonb('facilities'); // Array of facilities available
    table.jsonb('layout'); // Seat layout configuration
    table.boolean('has_seating').defaultTo(true);
    table.boolean('is_active').defaultTo(true);
    table.uuid('manager_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('contact_phone', 20);
    table.string('contact_email', 255);
    table.text('operating_hours'); // JSON string or text description
    table.timestamps(true, true);
    table.timestamp('deleted_at'); // Soft delete
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('venues');
};
