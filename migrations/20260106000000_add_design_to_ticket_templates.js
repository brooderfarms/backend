/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.hasTable('ticket_templates').then(exists => {
    if (exists) {
      return knex.schema.table('ticket_templates', function(table) {
        // Add design-related columns if they don't exist
        if (!table._modifiedColumnsMetadata || !table._modifiedColumnsMetadata['background_color']) {
          table.string('background_color', 7).defaultTo('#ffffff');
          table.text('background_image');
          table.jsonb('elements').defaultTo(knex.raw("'[]'"));
        }
      }).catch(() => {
        // Columns might already exist, ignore error
        return Promise.resolve();
      });
    }
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('ticket_templates', function(table) {
    table.dropColumn('background_color');
    table.dropColumn('background_image');
    table.dropColumn('elements');
  }).catch(() => Promise.resolve());
};
