exports.up = function(knex) {
  return knex.schema.createTable('payment_transactions', function(table) {
    table.increments('id').primary();
    table.uuid('payment_id').notNullable();
    table.uuid('user_id').notNullable();
    table.decimal('amount', 12, 2).notNullable();
    table.string('currency', 10).defaultTo('ZWL');
    table.string('method', 50).notNullable();
    table.string('provider', 50).notNullable();
    table.string('reference', 100).notNullable().unique();
    table.string('phone_number', 20).notNullable();
    table.enum('status', ['initiated', 'pending', 'processing', 'completed', 'failed', 'refunded']).defaultTo('initiated');
    table.timestamp('initiated_at').notNullable();
    table.timestamp('processed_at').nullable();
    table.timestamp('expires_at').notNullable();
    table.text('provider_response').nullable();
    table.timestamps();
    
    table.foreign('payment_id').references('id').inTable('payments').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users');
    table.index('reference');
    table.index('status');
    table.index('user_id');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('payment_transactions');
};
