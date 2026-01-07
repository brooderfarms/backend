/**
 * Migration: Create Settings Table
 * Purpose: Store system-wide settings like commission rates, VAT, and taxes
 */

exports.up = function(knex) {
  return knex.schema.createTable('settings', function(table) {
    table.increments('id').primary();
    table.string('key').unique().notNullable(); // commission_rate, vat_rate, tax_rate, etc.
    table.string('value').notNullable(); // JSON string for complex values or simple numbers
    table.string('type').notNullable().defaultTo('percentage'); // percentage, fixed, json
    table.text('description'); // Human-readable description
    table.uuid('updated_by'); // User ID who last updated
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Foreign key
    table.foreign('updated_by').references('users.id').onDelete('SET NULL');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('settings');
};
