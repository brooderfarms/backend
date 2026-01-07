/**
 * Create event_translations table
 * Stores event titles and descriptions in multiple languages
 */

exports.up = function (knex) {
  return knex.schema.createTable('event_translations', function (table) {
    table.increments('id').primary();
    table.uuid('event_id').notNullable();
    table.string('language', 10).notNullable(); // en, es, fr, sn
    table.string('title', 255);
    table.text('description');
    table.text('short_description');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Foreign key and constraints
    table.foreign('event_id').references('id').inTable('events').onDelete('CASCADE');
    table.unique(['event_id', 'language']);

    // Indexes
    table.index('event_id');
    table.index('language');
    table.index(['event_id', 'language']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('event_translations');
};
