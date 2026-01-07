exports.up = function(knex) {
  return knex.schema.createTable('nfc_cards', table => {
    table.increments('id').primary();
    
    // Card identification
    table.string('unique_id').unique().notNullable(); // Card UID - RFID/NFC unique identifier
    table.enum('card_type', ['nfc', 'rfid']).defaultTo('nfc');
    table.string('card_number').unique(); // Display-friendly card number
    
    // Ownership
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    
    // Usage & Balance
    table.decimal('balance', 10, 2).defaultTo(0); // Remaining balance (currency)
    table.decimal('total_spent', 10, 2).defaultTo(0); // Total spent across events
    table.integer('times_used').defaultTo(0); // Number of events attended
    
    // Status & Activation
    table.enum('status', ['inactive', 'active', 'suspended', 'expired']).defaultTo('inactive');
    table.timestamp('activated_at').nullable();
    table.timestamp('expires_at').nullable(); // Optional expiration date
    
    // Metadata
    table.json('metadata').nullable(); // JSON for additional data (color, nickname, etc)
    table.text('notes').nullable();
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes for performance
    table.index('user_id');
    table.index('status');
    table.index('unique_id');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('nfc_cards');
};
