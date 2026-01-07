/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('email_logs', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
    table.uuid('ticket_id').references('id').inTable('tickets').onDelete('SET NULL');
    table.uuid('event_id').references('id').inTable('events').onDelete('SET NULL');
    table.uuid('payment_id').references('id').inTable('payments').onDelete('SET NULL');
    table.enum('type', [
      'verification', 
      'password_reset', 
      'purchase_confirmation', 
      'digital_ticket', 
      'cart_reminder',
      'event_reminder',
      'transfer_notification',
      'refund_notification',
      'event_cancellation',
      'fraud_alert',
      'admin_notification'
    ]).notNullable();
    table.enum('status', ['sent', 'failed', 'bounced', 'opened', 'clicked']).defaultTo('sent');
    table.string('recipient_email', 255);
    table.text('subject');
    table.timestamp('sent_at').defaultTo(knex.fn.now());
    table.timestamp('opened_at');
    table.timestamp('clicked_at');
    table.text('error_message');
    table.timestamps(true, true);

    // Indexes for quick lookups
    table.index(['user_id']);
    table.index(['event_id']);
    table.index(['ticket_id']);
    table.index(['type']);
    table.index(['status']);
    table.index(['sent_at']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('email_logs');
};
