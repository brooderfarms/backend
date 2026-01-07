/**
 * Migration to add 'vendor' role to users table check constraint
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.raw(`
    -- Drop the existing check constraint
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    
    -- Add new constraint with vendor role included
    ALTER TABLE users ADD CONSTRAINT users_role_check 
      CHECK (role IN ('customer', 'organizer', 'venue_manager', 'admin', 'vendor'));
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.raw(`
    -- Restore original constraint
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    
    ALTER TABLE users ADD CONSTRAINT users_role_check 
      CHECK (role IN ('customer', 'organizer', 'venue_manager', 'admin'));
  `);
};
