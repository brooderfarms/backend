exports.up = function(knex) {
  return knex.schema.createTable('payment_refunds', function(table) {
    table.increments('id').primary();
    table.uuid('payment_id').notNullable();
    table.uuid('user_id').notNullable();
    table.decimal('amount', 12, 2).notNullable();
    table.string('currency', 10).defaultTo('ZWL');
    table.string('method', 50).notNullable();
    table.string('reason', 500).notNullable();
    table.enum('status', ['initiated', 'processing', 'completed', 'failed']).defaultTo('initiated');
    table.string('reference_id', 100).notNullable().unique();
    table.timestamp('initiated_at').notNullable();
    table.timestamp('completed_at').nullable();
    table.text('provider_response').nullable();
    table.timestamps();
    
    table.foreign('payment_id').references('id').inTable('payments').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users');
    table.index('status');
    table.index('user_id');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('payment_refunds');
};
