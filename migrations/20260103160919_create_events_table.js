/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('events', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('title', 255).notNullable();
    table.text('description');
    table.text('short_description', 500);
    table.enum('event_type', ['concert', 'sports', 'theater', 'conference', 'festival', 'exhibition', 'bus_trip', 'flight', 'other']).notNullable();
    table.enum('category', ['music', 'sports_soccer', 'sports_cricket', 'sports_other', 'arts', 'business', 'travel_bus', 'travel_flight', 'entertainment', 'other']).notNullable();
    table.uuid('venue_id').references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('organizer_id').references('id').inTable('users').onDelete('CASCADE');
    table.timestamp('start_date').notNullable();
    table.timestamp('end_date').notNullable();
    table.integer('duration_minutes'); // Calculated field
    table.decimal('base_price', 10, 2);
    table.string('currency', 3).defaultTo('USD');
    table.integer('total_capacity');
    table.integer('available_tickets').defaultTo(0);
    table.integer('sold_tickets').defaultTo(0);
    table.enum('status', ['draft', 'published', 'cancelled', 'completed', 'postponed']).defaultTo('draft');
    table.string('event_image_url', 500);
    table.jsonb('images'); // Array of image URLs
    table.jsonb('tags'); // Array of tags
    table.text('terms_and_conditions');
    table.text('refund_policy');
    table.boolean('is_featured').defaultTo(false);
    table.boolean('requires_approval').defaultTo(false);
    table.integer('min_age').defaultTo(0);
    table.boolean('has_seating').defaultTo(true);
    table.jsonb('seat_layout'); // Detailed seat layout configuration
    table.jsonb('pricing_tiers'); // Different price tiers for seats
    table.timestamp('published_at');
    table.timestamp('sales_start_date');
    table.timestamp('sales_end_date');
    table.timestamps(true, true);
    table.timestamp('deleted_at'); // Soft delete

    // Indexes for performance
    table.index(['event_type', 'status']);
    table.index(['start_date', 'end_date']);
    table.index(['venue_id']);
    table.index(['organizer_id']);
    table.index(['status', 'start_date']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('events');
};
