exports.up = function(knex) {
  return knex.schema.createTable('payment_verifications', function(table) {
    table.increments('id').primary();
    table.uuid('payment_id').notNullable();
    table.integer('fraud_score').defaultTo(0);
    table.boolean('is_legitimate').defaultTo(true);
    table.json('checks_performed').nullable();
    table.timestamp('verified_at').notNullable();
    table.timestamps();
    
    table.foreign('payment_id').references('id').inTable('payments').onDelete('CASCADE');
    table.index('is_legitimate');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('payment_verifications');
};
