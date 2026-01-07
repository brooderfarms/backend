exports.up = function(knex) {
  return knex.schema.createTable('nfc_card_transactions', table => {
    table.increments('id').primary();
    
    // References
    table.integer('nfc_card_id').unsigned().references('id').inTable('nfc_cards').onDelete('CASCADE');
    table.uuid('event_id').references('id').inTable('events').onDelete('SET NULL').nullable();
    table.uuid('venue_id').references('id').inTable('venues').onDelete('SET NULL').nullable();
    table.uuid('ticket_id').references('id').inTable('tickets').onDelete('SET NULL').nullable();
    
    // Transaction details
    table.enum('transaction_type', ['purchase', 'usage', 'refund', 'balance_add']).notNullable();
    table.decimal('amount', 10, 2).notNullable();
    table.decimal('balance_after', 10, 2).notNullable(); // Balance after this transaction
    
    // Scan/Check-in info
    table.string('scan_location').nullable(); // Venue or gate info
    table.timestamp('scanned_at').nullable();
    table.json('scan_metadata').nullable(); // Device info, location coords, etc
    
    // Status
    table.enum('status', ['pending', 'completed', 'failed']).defaultTo('completed');
    table.text('notes').nullable();
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('nfc_card_id');
    table.index('event_id');
    table.index('venue_id');
    table.index('created_at');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('nfc_card_transactions');
};
