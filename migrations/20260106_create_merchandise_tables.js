/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    // Merchandise types
    .createTable('merchandise_types', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('name', 100).notNullable(); // Cards, Tags, Bands, Lanyards, etc.
      table.text('description');
      table.enum('category', ['cards', 'tags', 'bands', 'lanyards', 'badges', 'other']).notNullable();
      table.decimal('base_price', 10, 2).notNullable();
      table.integer('min_quantity').defaultTo(100);
      table.integer('max_quantity').defaultTo(10000);
      table.string('material', 100); // Paper, PVC, Silicone, Plastic, etc.
      table.string('color', 100);
      table.decimal('dimensions_width', 8, 2); // in cm
      table.decimal('dimensions_height', 8, 2);
      table.decimal('dimensions_depth', 8, 2);
      table.string('unit_weight', 50); // grams
      table.jsonb('available_colors'); // Array of color options
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
      table.timestamp('deleted_at');
      table.index(['category', 'is_active']);
    })
    
    // Customization options
    .createTable('merchandise_customizations', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('merchandise_type_id').references('id').inTable('merchandise_types').onDelete('CASCADE').notNullable();
      table.string('option_name', 100).notNullable(); // Printing, Logo, Design, Statement, etc.
      table.enum('option_type', ['printing', 'logo_upload', 'custom_text', 'design_template', 'color_option']).notNullable();
      table.decimal('additional_cost', 10, 2).defaultTo(0);
      table.boolean('is_required').defaultTo(false);
      table.jsonb('details'); // Additional config like max_text_length, accepted_file_types
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
      table.index(['merchandise_type_id']);
    })
    
    // Merchandise orders
    .createTable('merchandise_orders', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
      table.uuid('organization_id').nullable(); // Venue or Event ID
      table.string('order_number', 50).unique().notNullable();
      table.enum('status', ['draft', 'pending', 'approved', 'production', 'ready', 'shipped', 'delivered', 'cancelled']).defaultTo('pending');
      table.decimal('subtotal', 10, 2).notNullable();
      table.decimal('customization_cost', 10, 2).defaultTo(0);
      table.decimal('shipping_cost', 10, 2).defaultTo(0);
      table.decimal('tax', 10, 2).defaultTo(0);
      table.decimal('total_amount', 10, 2).notNullable();
      table.string('currency', 3).defaultTo('USD');
      table.text('delivery_address');
      table.string('delivery_city', 100);
      table.string('delivery_country', 100);
      table.string('delivery_postal_code', 20);
      table.timestamp('requested_delivery_date');
      table.timestamp('estimated_delivery_date');
      table.timestamp('actual_delivery_date');
      table.text('special_instructions');
      table.string('shipping_tracking_number', 100);
      table.jsonb('metadata'); // Additional order data
      table.timestamps(true, true);
      table.timestamp('deleted_at');
      table.index(['user_id', 'status']);
      table.index(['status', 'created_at']);
    })
    
    // Order items
    .createTable('merchandise_order_items', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('order_id').references('id').inTable('merchandise_orders').onDelete('CASCADE').notNullable();
      table.uuid('merchandise_type_id').references('id').inTable('merchandise_types').onDelete('RESTRICT').notNullable();
      table.integer('quantity').notNullable();
      table.decimal('unit_price', 10, 2).notNullable();
      table.jsonb('customization_selections'); // Selected customization options
      table.string('custom_text', 500); // For text-based customizations
      table.string('logo_url', 500); // Uploaded logo/image
      table.jsonb('design_data'); // For design customizations
      table.timestamps(true, true);
      table.index(['order_id']);
    })
    
    // Design templates
    .createTable('merchandise_design_templates', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('merchandise_type_id').references('id').inTable('merchandise_types').onDelete('CASCADE').notNullable();
      table.string('name', 100).notNullable();
      table.text('description');
      table.string('template_image_url', 500);
      table.string('preview_image_url', 500);
      table.jsonb('template_structure'); // Design template config
      table.boolean('is_public').defaultTo(true);
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
      table.index(['merchandise_type_id', 'is_public']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('merchandise_design_templates')
    .dropTableIfExists('merchandise_order_items')
    .dropTableIfExists('merchandise_orders')
    .dropTableIfExists('merchandise_customizations')
    .dropTableIfExists('merchandise_types');
};
