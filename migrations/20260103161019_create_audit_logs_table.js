/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('audit_logs', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('action', 100).notNullable(); // CREATE, UPDATE, DELETE, LOGIN, etc.
    table.string('resource', 100).notNullable(); // users, events, tickets, payments, etc.
    table.uuid('resource_id'); // ID of the affected resource
    table.jsonb('old_values'); // Previous state for updates
    table.jsonb('new_values'); // New state for updates/creates
    table.jsonb('metadata'); // Additional context
    table.string('ip_address', 45);
    table.string('user_agent', 500);
    table.timestamp('timestamp').defaultTo(knex.fn.now());
    table.string('session_id', 255);
    table.boolean('is_suspicious').defaultTo(false);
    table.text('notes'); // Additional notes or comments

    // Indexes for performance and querying
    table.index(['user_id', 'timestamp']);
    table.index(['action', 'resource']);
    table.index(['resource', 'resource_id']);
    table.index(['timestamp']);
    table.index(['is_suspicious']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('audit_logs');
};
