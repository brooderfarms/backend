/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('tickets', function(table) {
    // Streaming access
    table.boolean('has_streaming_access').defaultTo(false);
    table.string('stream_access_token', 255); // Unique token for stream access
    table.timestamp('stream_access_granted_at'); // When streaming access was granted
    table.timestamp('stream_access_expires_at'); // When streaming access expires
    table.boolean('can_watch_replay').defaultTo(false); // Whether ticket allows replay viewing
    table.integer('stream_views_count').defaultTo(0); // How many times user accessed the stream
    table.timestamp('last_stream_access'); // Last time user accessed the stream
    table.boolean('stream_notification_sent').defaultTo(false); // Whether stream notification was sent
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('tickets', function(table) {
    table.dropColumn('has_streaming_access');
    table.dropColumn('stream_access_token');
    table.dropColumn('stream_access_granted_at');
    table.dropColumn('stream_access_expires_at');
    table.dropColumn('can_watch_replay');
    table.dropColumn('stream_views_count');
    table.dropColumn('last_stream_access');
    table.dropColumn('stream_notification_sent');
  });
};
