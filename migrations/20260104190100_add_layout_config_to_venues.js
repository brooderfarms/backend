exports.up = function(knex) {
  return knex.schema.table('venues', function(table) {
    table.jsonb('layout_config').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.table('venues', function(table) {
    table.dropColumn('layout_config');
  });
};
