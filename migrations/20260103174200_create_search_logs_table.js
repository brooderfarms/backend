/**
 * Create search_logs table
 * Tracks user search queries for analytics and suggestions
 */

exports.up = function (knex) {
  return knex.schema.createTable('search_logs', function (table) {
    table.increments('id').primary();
    table.uuid('user_id');
    table.string('search_term', 255).notNullable();
    table.string('search_type', 50).notNullable().defaultTo('events'); // events, venues, users
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Foreign key
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');

    // Indexes for faster queries
    table.index('user_id');
    table.index('search_term');
    table.index('search_type');
    table.index('created_at');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('search_logs');
};
