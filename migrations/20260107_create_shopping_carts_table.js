exports.up = async function(knex) {
  // Create shopping_carts table
  await knex.schema.createTable('shopping_carts', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').nullable().index();
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
    table.boolean('is_guest').defaultTo(false).index();
    table.string('status').defaultTo('active'); // active, abandoned, completed
    table.decimal('total_amount', 12, 2).defaultTo(0);
    table.timestamp('expires_at').nullable();
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();
    
    // Indexes
    table.index(['user_id', 'status']);
    table.index(['is_guest', 'status']);
    table.index('expires_at');
  });

  // Create shopping_cart_items table
  await knex.schema.createTable('shopping_cart_items', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('cart_id').notNullable().index();
    table.foreign('cart_id').references('shopping_carts.id').onDelete('CASCADE');
    table.uuid('event_id').notNullable().index();
    table.foreign('event_id').references('events.id').onDelete('CASCADE');
    table.uuid('ticket_id').nullable();
    table.foreign('ticket_id').references('tickets.id').onDelete('SET NULL');
    table.string('ticket_type').defaultTo('standard');
    table.integer('quantity').defaultTo(1);
    table.decimal('unit_price', 12, 2).defaultTo(0);
    table.decimal('total_price', 12, 2).defaultTo(0);
    table.json('seat_numbers').nullable(); // Array of seat numbers if applicable
    table.json('metadata').nullable(); // Additional cart item data
    table.timestamps(true, true);
    
    // Indexes
    table.index(['cart_id', 'event_id']);
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('shopping_cart_items');
  await knex.schema.dropTableIfExists('shopping_carts');
};
