/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('events', function(table) {
    table.jsonb('ticket_quantities').defaultTo(JSON.stringify({
      standard: 100,
      vip: 50,
      premium: 30,
      economy: 0,
      business: 0,
      first_class: 0
    }));
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('events', function(table) {
    table.dropColumn('ticket_quantities');
  });
};
