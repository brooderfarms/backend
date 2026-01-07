/**
 * Create user_currency_preferences table
 * Stores user's preferred currency for displaying prices
 */

exports.up = function (knex) {
  return knex.schema.createTable('user_currency_preferences', function (table) {
    table.increments('id').primary();
    table.uuid('user_id').notNullable();
    table.string('preferred_currency', 3).notNullable().defaultTo('USD');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Foreign key and constraints
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.unique('user_id');

    // Indexes
    table.index('user_id');
    table.index('preferred_currency');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('user_currency_preferences');
};
