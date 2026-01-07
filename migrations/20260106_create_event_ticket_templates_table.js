/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.hasTable('event_ticket_templates').then(exists => {
    if (!exists) {
      return knex.schema.createTable('event_ticket_templates', function(table) {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('event_id').references('id').inTable('events').onDelete('CASCADE').notNullable();
        table.uuid('template_id').references('id').inTable('ticket_templates').onDelete('CASCADE').notNullable();
        table.integer('quantity').notNullable(); // Number of tickets to generate from this template
        table.decimal('override_price', 10, 2); // Optional: override the template's base price for this event
        table.string('seat_section', 50); // Optional: limit this template to a specific section
        table.integer('position').defaultTo(0); // For ordering multiple templates in an event
        table.timestamps(true, true);

        // Unique constraint: one template per event
        table.unique(['event_id', 'template_id']);
        
        // Indexes
        table.index(['event_id']);
        table.index(['template_id']);
      });
    }
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('event_ticket_templates');
};
