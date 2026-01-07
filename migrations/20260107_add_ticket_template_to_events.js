/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('events', function(table) {
    table.uuid('ticket_template_id').references('id').inTable('ticket_templates').onDelete('SET NULL');
    table.index(['ticket_template_id']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('events', function(table) {
    table.dropIndex(['ticket_template_id']);
    table.dropColumn('ticket_template_id');
  });
};
