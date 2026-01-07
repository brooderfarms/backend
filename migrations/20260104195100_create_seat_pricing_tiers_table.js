/**
 * Create seat_pricing_tiers table for zone pricing/color
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('seat_pricing_tiers', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('event_id').notNullable();
    table.string('name', 64).notNullable();
    table.string('description', 255);
    table.decimal('price', 10, 2).notNullable();
    table.string('section', 64);
    table.string('color', 16).defaultTo('#888').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('deleted_at');
    table.unique(['event_id', 'name']);
    table.foreign('event_id').references('id').inTable('events').onDelete('CASCADE');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('seat_pricing_tiers');
};
