exports.up = function(knex) {
  return knex.schema
    // Create seasonal_tickets table
    .createTable('seasonal_tickets', table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('organizer_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('name', 255).notNullable();
      table.text('description');
      table.integer('season_year').notNullable(); // e.g., 2026
      table.enum('season_type', ['spring', 'summer', 'fall', 'winter', 'full-year', 'custom']).defaultTo('custom');
      table.timestamp('start_date').notNullable();
      table.timestamp('end_date').notNullable();
      table.decimal('base_price', 10, 2).notNullable(); // Original price
      table.decimal('season_price', 10, 2).notNullable(); // Discounted price
      table.decimal('discount_percentage', 5, 2); // e.g., 20 for 20% off
      table.integer('total_events').defaultTo(0); // Number of events in season
      table.integer('available_quantity').notNullable(); // How many season passes to sell
      table.integer('sold_quantity').defaultTo(0);
      table.string('image_url', 500); // Season pass image/poster
      table.enum('status', ['draft', 'published', 'archived']).defaultTo('draft');
      table.timestamps(true, true);
      
      // Indexes
      table.index('organizer_id');
      table.index('status');
      table.index('season_year');
    })
    
    // Create seasonal_ticket_events junction table
    .createTable('seasonal_ticket_events', table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('seasonal_ticket_id').notNullable().references('id').inTable('seasonal_tickets').onDelete('CASCADE');
      table.uuid('event_id').notNullable().references('id').inTable('events').onDelete('CASCADE');
      table.timestamps(true, true);
      
      // Unique constraint - each event can be in a season only once
      table.unique(['seasonal_ticket_id', 'event_id']);
      
      // Indexes
      table.index('seasonal_ticket_id');
      table.index('event_id');
    })
    
    // Create seasonal_ticket_purchases table
    .createTable('seasonal_ticket_purchases', table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('seasonal_ticket_id').notNullable().references('id').inTable('seasonal_tickets').onDelete('CASCADE');
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.decimal('price_paid', 10, 2).notNullable();
      table.enum('status', ['completed', 'pending', 'cancelled']).defaultTo('pending');
      table.string('reference_code', 50).unique();
      table.uuid('payment_id').references('id').inTable('payments').onDelete('SET NULL');
      table.timestamps(true, true);
      
      // Indexes
      table.index('seasonal_ticket_id');
      table.index('user_id');
      table.index('status');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('seasonal_ticket_purchases')
    .dropTableIfExists('seasonal_ticket_events')
    .dropTableIfExists('seasonal_tickets');
};
