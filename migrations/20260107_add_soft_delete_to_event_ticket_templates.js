/**
 * Add soft-delete support to event_ticket_templates table
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('event_ticket_templates', function(table) {
    table.timestamp('deleted_at').nullable().defaultTo(null);
  });
};

/**
 * Remove soft-delete column from event_ticket_templates table
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('event_ticket_templates', function(table) {
    table.dropColumn('deleted_at');
  });
};
