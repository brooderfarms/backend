/**
 * Migration: Add soft-delete (deleted_at) column to core tables
 * Enables safe deletion without losing historical data
 */

exports.up = async function(knex) {
  const tables = [
    'users',
    'venues',
    'events',
    'tickets',
    'seats',
    'payments',
    'merchandise_types',
    'merchandise_customizations',
    'ticket_templates',
    'seasonal_tickets',
  ];

  for (const table of tables) {
    const hasTable = await knex.schema.hasTable(table);
    if (!hasTable) {
      console.log(`⚠️  Table ${table} does not exist yet, skipping`);
      continue;
    }
    
    const hasColumn = await knex.schema.hasColumn(table, 'deleted_at');
    if (!hasColumn) {
      await knex.schema.table(table, (t) => {
        t.timestamp('deleted_at').nullable().defaultTo(null);
      });
      console.log(`✅ Added deleted_at column to ${table}`);
    } else {
      console.log(`⚠️  ${table} already has deleted_at column`);
    }
  }
};

exports.down = async function(knex) {
  const tables = [
    'users',
    'venues',
    'events',
    'tickets',
    'seats',
    'payments',
    'merchandise',
    'merchandise_designs',
    'ticket_templates',
    'seasonal_tickets',
  ];

  for (const table of tables) {
    const hasColumn = await knex.schema.hasColumn(table, 'deleted_at');
    if (hasColumn) {
      await knex.schema.table(table, (t) => {
        t.dropColumn('deleted_at');
      });
      console.log(`✅ Removed deleted_at column from ${table}`);
    }
  }
};
