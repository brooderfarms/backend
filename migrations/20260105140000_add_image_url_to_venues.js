/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('venues', function(table) {
    table.text('image_url').nullable(); // S3 image URL
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('venues', function(table) {
    table.dropColumn('image_url');
  });
};
