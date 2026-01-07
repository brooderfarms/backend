/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  // Drop the check constraint that validates enum values
  return knex.raw(`ALTER TABLE ticket_templates DROP CONSTRAINT IF EXISTS ticket_templates_digital_format_check`);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  // This down migration is intentionally minimal
  return Promise.resolve();
};
