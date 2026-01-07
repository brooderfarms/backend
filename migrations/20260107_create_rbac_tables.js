/**
 * Create RBAC tables: roles, permissions, role_permissions, user_roles
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    // Create permissions table
    .createTable('permissions', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('name', 100).notNullable().unique(); // e.g., 'events.create', 'users.delete'
      table.text('description');
      table.string('category', 50).notNullable(); // e.g., 'events', 'users', 'payments'
      table.boolean('is_system').defaultTo(false); // System permissions cannot be modified
      table.timestamps(true, true);
      table.timestamp('deleted_at').nullable().defaultTo(null);

      table.index('category');
      table.index('is_system');
    })
    // Create roles table
    .createTable('roles', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('name', 100).notNullable().unique(); // e.g., 'admin', 'organizer', 'viewer'
      table.text('description');
      table.integer('priority').defaultTo(0); // Higher priority = more permissions
      table.boolean('is_system').defaultTo(false); // System roles (admin, customer, etc.)
      table.timestamps(true, true);
      table.timestamp('deleted_at').nullable().defaultTo(null);

      table.index('is_system');
      table.index('priority');
    })
    // Create role_permissions junction table
    .createTable('role_permissions', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('role_id').references('id').inTable('roles').onDelete('CASCADE').notNullable();
      table.uuid('permission_id').references('id').inTable('permissions').onDelete('CASCADE').notNullable();
      table.timestamps(true, true);

      table.unique(['role_id', 'permission_id']);
      table.index('role_id');
      table.index('permission_id');
    })
    // Create user_roles junction table (for custom role assignments)
    .createTable('user_roles', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
      table.uuid('role_id').references('id').inTable('roles').onDelete('CASCADE').notNullable();
      table.string('scope', 100); // e.g., 'event:123', 'venue:456' for scoped permissions
      table.timestamp('expires_at'); // Optional expiration for temporary roles
      table.uuid('granted_by').references('id').inTable('users'); // Admin who granted the role
      table.text('reason'); // Why this role was granted
      table.timestamps(true, true);
      table.timestamp('deleted_at').nullable().defaultTo(null);

      table.unique(['user_id', 'role_id', 'scope']); // User can't have duplicate scoped roles
      table.index('user_id');
      table.index('role_id');
      table.index('scope');
      table.index('expires_at');
    });
};

/**
 * Rollback: Drop RBAC tables
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('user_roles')
    .dropTableIfExists('role_permissions')
    .dropTableIfExists('roles')
    .dropTableIfExists('permissions');
};
