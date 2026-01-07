/**
 * Migration: Create Payment Methods Table
 * Stores available payment methods and their configurations
 */

exports.up = function(knex) {
  return knex.schema.createTable('payment_methods', function(table) {
    table.increments('id').primary();
    table.string('code').unique().notNullable(); // ecocash, zipit, zimswitch, innbucks, paypal, visa, mastercard
    table.string('name').notNullable(); // Display name
    table.string('category').notNullable(); // local, international, card
    table.text('description');
    table.boolean('enabled').defaultTo(true);
    table.string('gateway_provider'); // API provider name
    table.json('config'); // Gateway-specific configuration
    table.decimal('min_amount', 15, 2).defaultTo(0);
    table.decimal('max_amount', 15, 2).nullable();
    table.string('currency').defaultTo('ZWL'); // ZWL for local, USD for international
    table.json('fees'); // { percentage: 2.5, fixed: 0 }
    table.integer('processing_time_minutes').defaultTo(5); // Expected processing time
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('payment_methods');
};
