/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('ticket_templates', function(table) {
    // Modify the digital_format column to accept text (for JSON array storage)
    // This removes the enum constraint and allows storing JSON arrays
    table.text('digital_format').alter();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('ticket_templates', function(table) {
    // Revert to enum if rolling back
    table.enum('digital_format', ['qr_code', 'nfc', 'rfid', 'barcode']).alter();
  });
};
