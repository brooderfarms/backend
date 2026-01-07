/**
 * Create translations table
 * Stores UI string translations for multiple languages
 */

exports.up = function (knex) {
  return knex.schema.createTable('translations', function (table) {
    table.increments('id').primary();
    table.string('key', 100).notNullable(); // e.g., 'common.welcome'
    table.string('language', 10).notNullable(); // en, es, fr, sn
    table.text('value').notNullable(); // Translated string
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Unique constraint: each key is unique per language
    table.unique(['key', 'language']);

    // Indexes
    table.index('key');
    table.index('language');
    table.index(['key', 'language']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('translations');
};
