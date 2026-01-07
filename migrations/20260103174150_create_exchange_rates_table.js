/**
 * Create exchange_rates table
 * Stores real-time exchange rates for multi-currency support
 */

exports.up = function (knex) {
  return knex.schema.createTable('exchange_rates', function (table) {
    table.increments('id').primary();
    table.string('base_currency', 3).notNullable().unique();
    table.json('rates').notNullable(); // { USD: 1, ZWL: 350, GBP: 0.79, ... }
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('base_currency');
    table.index('updated_at');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('exchange_rates');
};
