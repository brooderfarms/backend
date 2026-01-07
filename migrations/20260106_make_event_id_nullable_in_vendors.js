exports.up = function(knex) {
  return knex.schema.alterTable('vendors', table => {
    // Make event_id nullable to support general vendor accounts
    table.uuid('event_id').nullable().alter();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('vendors', table => {
    // Revert to NOT NULL
    table.uuid('event_id').notNullable().alter();
  });
};
