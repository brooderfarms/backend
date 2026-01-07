/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('event_sessions', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('event_id').notNullable().references('id').inTable('events').onDelete('CASCADE');
    table.string('session_name').notNullable(); // e.g., "Day 1 - Morning", "Session A"
    table.text('session_description').nullable();
    table.dateTime('start_time').notNullable();
    table.dateTime('end_time').notNullable();
    table.integer('capacity').notNullable();
    table.integer('available_seats').notNullable();
    table.decimal('base_price', 12, 2).notNullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable();

    table.index(['event_id']);
    table.index(['start_time']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('event_sessions');
};
