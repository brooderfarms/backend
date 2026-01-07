/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('tickets', function(table) {
    table.uuid('session_id').nullable();
    // Foreign key will be added when event_sessions table is created
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('tickets', function(table) {
    table.dropColumn('session_id');
  });
};
