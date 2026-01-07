/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).unique().notNullable();
    table.string('password_hash', 255).notNullable();
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.string('phone', 20);
    table.date('date_of_birth');
    table.enum('gender', ['male', 'female', 'other']).defaultTo('other');
    table.text('address');
    table.string('city', 100);
    table.string('state', 100);
    table.string('country', 100).defaultTo('Zimbabwe');
    table.string('postal_code', 20);
    table.string('id_number', 50); // National ID
    table.string('profile_image_url', 500);
    table.enum('role', ['customer', 'organizer', 'venue_manager', 'admin']).defaultTo('customer');
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_verified').defaultTo(false);
    table.boolean('email_verified').defaultTo(false);
    table.boolean('phone_verified').defaultTo(false);
    table.timestamp('email_verified_at');
    table.timestamp('phone_verified_at');
    table.timestamp('last_login_at');
    table.integer('login_attempts').defaultTo(0);
    table.timestamp('locked_until');
    table.text('preferences').defaultTo('{}'); // JSON string for user preferences
    table.timestamps(true, true); // created_at, updated_at
    table.timestamp('deleted_at'); // Soft delete
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('users');
};
