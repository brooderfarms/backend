/**
 * Create user_language_preferences table
 * Stores user's preferred language for the UI
 */

exports.up = function (knex) {
  return knex.schema.createTable('user_language_preferences', function (table) {
    table.increments('id').primary();
    table.uuid('user_id').notNullable();
    table.string('preferred_language', 10).notNullable().defaultTo('en');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Foreign key and constraints
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.unique('user_id');

    // Indexes
    table.index('user_id');
    table.index('preferred_language');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('user_language_preferences');
};
