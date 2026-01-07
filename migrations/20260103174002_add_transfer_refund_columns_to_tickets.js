exports.up = async function(knex) {
  const hasTransferCount = await knex.schema.hasColumn('tickets', 'transfer_count');
  const hasTransferredAt = await knex.schema.hasColumn('tickets', 'transferred_at');
  const hasRefundedAt = await knex.schema.hasColumn('tickets', 'refunded_at');
  return knex.schema.table('tickets', function(table) {
    if (!hasTransferCount) table.integer('transfer_count').defaultTo(0);
    if (!hasTransferredAt) table.timestamp('transferred_at').nullable();
    if (!hasRefundedAt) table.timestamp('refunded_at').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.table('tickets', function(table) {
    table.dropColumn('transfer_count');
    table.dropColumn('transferred_at');
    table.dropColumn('refunded_at');
  });
};
