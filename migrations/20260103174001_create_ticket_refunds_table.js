exports.up = function(knex) {
  return knex.schema.createTable('ticket_refunds', function(table) {
    table.increments('id').primary();
    table.uuid('ticket_id').notNullable();
    table.uuid('user_id').notNullable();
    table.decimal('original_amount', 10, 2).notNullable();
    table.decimal('refund_amount', 10, 2).notNullable();
    table.string('reason', 500).notNullable();
    table.enum('status', ['pending', 'approved', 'rejected']).defaultTo('pending');
    table.string('payment_method', 50).notNullable();
    table.timestamp('requested_at').notNullable();
    table.timestamp('approved_at').nullable();
    table.timestamp('rejected_at').nullable();
    table.uuid('approved_by').nullable();
    table.uuid('rejected_by').nullable();
    table.string('rejection_reason', 500).nullable();
    table.timestamps();
    
    table.foreign('ticket_id').references('id').inTable('tickets').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users');
    table.foreign('approved_by').references('id').inTable('users');
    table.foreign('rejected_by').references('id').inTable('users');
    table.index('status');
    table.index('user_id');
    table.index('requested_at');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('ticket_refunds');
};
