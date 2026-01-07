// seeds/00_admin.js
// Seed an initial admin user for the system

const bcrypt = require('bcryptjs');

exports.seed = async function(knex) {
  // Deletes ALL existing admin users (optional, for idempotency)
  await knex('users').where('role', 'admin').del();

  const passwordHash = await bcrypt.hash('admin123', 10);

  await knex('users').insert({
    id: knex.raw('gen_random_uuid()'),
    email: 'admin@ticketing.local',
    password_hash: passwordHash,
    first_name: 'System',
    last_name: 'Admin',
    phone: '+263000000000',
    role: 'admin',
    is_active: true,
    is_verified: true,
    email_verified: true,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now()
  });
};
