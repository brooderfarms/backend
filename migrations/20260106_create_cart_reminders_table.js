/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('cart_reminders', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
    table.integer('items_count').defaultTo(0);
    table.decimal('total_amount', 10, 2);
    table.timestamp('sent_at').defaultTo(knex.fn.now());
    table.enum('status', ['sent', 'clicked', 'converted', 'expired']).defaultTo('sent');
    table.timestamp('clicked_at');
    table.timestamp('converted_at');
    table.timestamps(true, true);

    // Indexes
    table.index(['user_id']);
    table.index(['sent_at']);
    table.index(['status']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('cart_reminders');
};
