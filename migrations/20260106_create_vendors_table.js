/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('vendors', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
      table.uuid('event_id').references('id').inTable('events').onDelete('CASCADE').notNullable();
      table.string('vendor_name', 255).notNullable();
      table.text('description');
      table.enum('category', ['food', 'beverages', 'merchandise', 'crafts', 'services', 'technology', 'health', 'other']).defaultTo('other');
      table.string('contact_phone', 20);
      table.string('contact_email', 255);
      table.string('website', 500);
      table.string('business_license', 255);
      table.string('logo_url', 500);
      table.text('booth_location'); // Booth number or location
      table.integer('booth_size'); // Size in sq meters
      table.decimal('commission_rate', 5, 2).defaultTo(10); // 10% commission
      table.enum('status', ['pending', 'approved', 'active', 'inactive', 'suspended']).defaultTo('pending');
      table.decimal('rating', 3, 2).defaultTo(0);
      table.integer('total_reviews').defaultTo(0);
      table.decimal('total_sales', 10, 2).defaultTo(0);
      table.integer('total_orders').defaultTo(0);
      table.jsonb('bank_details'); // Bank account for payouts
      table.jsonb('additional_info'); // Flexible metadata
      table.timestamp('approved_at');
      table.timestamp('activated_at');
      table.timestamps(true, true);
      table.timestamp('deleted_at'); // Soft delete

      // Indexes
      table.index(['user_id', 'event_id']);
      table.index(['event_id', 'status']);
      table.index(['category']);
      table.index(['rating']);
    })
    .createTable('vendor_products', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('vendor_id').references('id').inTable('vendors').onDelete('CASCADE').notNullable();
      table.string('name', 255).notNullable();
      table.text('description');
      table.decimal('price', 10, 2).notNullable();
      table.decimal('cost', 10, 2); // Cost for profit calculation
      table.enum('category', ['food', 'drink', 'apparel', 'merchandise', 'souvenirs', 'services', 'other']).defaultTo('other');
      table.string('image_url', 500);
      table.integer('stock').defaultTo(0);
      table.integer('sold').defaultTo(0);
      table.boolean('is_available').defaultTo(true);
      table.integer('quantity_sold').defaultTo(0);
      table.decimal('total_revenue', 10, 2).defaultTo(0);
      table.timestamps(true, true);
      table.timestamp('deleted_at');

      // Indexes
      table.index(['vendor_id']);
      table.index(['is_available']);
    })
    .createTable('vendor_orders', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('vendor_id').references('id').inTable('vendors').onDelete('CASCADE').notNullable();
      table.uuid('buyer_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
      table.uuid('event_id').references('id').inTable('events').onDelete('CASCADE').notNullable();
      table.decimal('subtotal', 10, 2).notNullable();
      table.decimal('tax', 10, 2).defaultTo(0);
      table.decimal('total_amount', 10, 2).notNullable();
      table.decimal('vendor_payout', 10, 2); // After commission
      table.enum('payment_status', ['pending', 'completed', 'failed', 'refunded']).defaultTo('pending');
      table.enum('fulfillment_status', ['pending', 'preparing', 'ready', 'completed', 'cancelled']).defaultTo('pending');
      table.string('order_number', 50).unique();
      table.text('notes'); // Booth location, special requests
      table.timestamp('completed_at');
      table.timestamps(true, true);

      // Indexes
      table.index(['vendor_id', 'fulfillment_status']);
      table.index(['buyer_id', 'event_id']);
      table.index(['created_at']);
    })
    .createTable('vendor_order_items', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('order_id').references('id').inTable('vendor_orders').onDelete('CASCADE').notNullable();
      table.uuid('product_id').references('id').inTable('vendor_products').onDelete('CASCADE').notNullable();
      table.integer('quantity').notNullable();
      table.decimal('unit_price', 10, 2).notNullable();
      table.decimal('line_total', 10, 2).notNullable();

      // Indexes
      table.index(['order_id']);
      table.index(['product_id']);
    })
    .createTable('vendor_ratings', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('vendor_id').references('id').inTable('vendors').onDelete('CASCADE').notNullable();
      table.uuid('order_id').references('id').inTable('vendor_orders').onDelete('CASCADE');
      table.uuid('reviewer_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
      table.integer('rating').notNullable(); // 1-5 stars
      table.text('review');
      table.timestamps(true, true);

      // Indexes
      table.index(['vendor_id']);
      table.index(['rating']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('vendor_ratings')
    .dropTableIfExists('vendor_order_items')
    .dropTableIfExists('vendor_orders')
    .dropTableIfExists('vendor_products')
    .dropTableIfExists('vendors');
};
