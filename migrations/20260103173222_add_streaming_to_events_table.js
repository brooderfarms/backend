/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('events', function(table) {
    // Streaming capabilities
    table.boolean('is_streaming_event').defaultTo(false);
    table.string('stream_url', 500); // External streaming service URL
    table.string('stream_key', 255); // Stream key for authentication
    table.string('stream_provider', 100); // e.g., 'youtube', 'twitch', 'custom'
    table.string('stream_embed_code', 2000); // Embed code for the stream
    table.timestamp('stream_start_time'); // When streaming actually starts
    table.timestamp('stream_end_time'); // When streaming ends
    table.boolean('is_stream_active').defaultTo(false); // Whether stream is currently live
    table.integer('stream_viewer_count').defaultTo(0); // Current viewer count
    table.text('stream_description'); // Streaming-specific description
    table.decimal('streaming_price', 10, 2); // Price for streaming access (if different from venue)
    table.boolean('allow_replay').defaultTo(false); // Whether to allow replay after live stream
    table.timestamp('replay_available_until'); // When replay expires
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('events', function(table) {
    table.dropColumn('is_streaming_event');
    table.dropColumn('stream_url');
    table.dropColumn('stream_key');
    table.dropColumn('stream_provider');
    table.dropColumn('stream_embed_code');
    table.dropColumn('stream_start_time');
    table.dropColumn('stream_end_time');
    table.dropColumn('is_stream_active');
    table.dropColumn('stream_viewer_count');
    table.dropColumn('stream_description');
    table.dropColumn('streaming_price');
    table.dropColumn('allow_replay');
    table.dropColumn('replay_available_until');
  });
};
