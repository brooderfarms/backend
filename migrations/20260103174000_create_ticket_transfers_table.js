exports.up = function(knex) {
  return knex.schema.createTable('ticket_transfers', function(table) {
    table.increments('id').primary();
    table.uuid('ticket_id').notNullable();
    table.uuid('from_user_id').notNullable();
    table.uuid('to_user_id').nullable();
    table.string('to_email', 255).nullable();
    table.enum('status', ['pending', 'accepted', 'declined', 'expired']).defaultTo('pending');
    table.string('transfer_code', 50).notNullable().unique();
    table.timestamp('requested_at').notNullable();
    table.timestamp('accepted_at').nullable();
    table.timestamp('declined_at').nullable();
    table.timestamp('expires_at').notNullable();
    table.timestamps();
    
    table.foreign('ticket_id').references('tickets.id').onDelete('CASCADE');
    table.foreign('from_user_id').references('users.id');
    table.foreign('to_user_id').references('users.id');
    table.index('status');
    table.index('from_user_id');
    table.index('to_user_id');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('ticket_transfers');
};
