const db = require('./config/database');

async function createTables() {
  try {
    // Create ticket_templates table
    const hasTicketTemplates = await db.schema.hasTable('ticket_templates');
    if (!hasTicketTemplates) {
      await db.schema.createTable('ticket_templates', function(table) {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.uuid('organizer_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
        table.string('name', 100).notNullable();
        table.text('description');
        table.enum('ticket_type', ['standard', 'vip', 'premium', 'economy', 'business', 'first_class']).defaultTo('standard');
        table.enum('ticket_format', ['digital', 'physical']).defaultTo('digital');
        table.enum('digital_format', ['qr_code', 'nfc', 'rfid', 'barcode']).defaultTo('qr_code');
        table.decimal('base_price', 10, 2).notNullable();
        table.string('currency', 3).defaultTo('USD');
        table.decimal('service_fee', 10, 2).defaultTo(0);
        table.boolean('is_transferable').defaultTo(false);
        table.boolean('is_refundable').defaultTo(true);
        table.integer('validity_days');
        table.jsonb('seat_restrictions');
        table.jsonb('metadata');
        table.boolean('is_active').defaultTo(true);
        table.timestamps(true, true);
        table.timestamp('deleted_at');
        table.index(['organizer_id', 'is_active']);
        table.index(['created_at']);
      });
      console.log('✓ ticket_templates table created');
    } else {
      console.log('✓ ticket_templates table already exists');
    }

    // Create event_ticket_templates table
    const hasEventTemplates = await db.schema.hasTable('event_ticket_templates');
    if (!hasEventTemplates) {
      await db.schema.createTable('event_ticket_templates', function(table) {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.uuid('event_id').references('id').inTable('events').onDelete('CASCADE').notNullable();
        table.uuid('template_id').references('id').inTable('ticket_templates').onDelete('CASCADE').notNullable();
        table.integer('quantity').notNullable();
        table.decimal('override_price', 10, 2);
        table.string('seat_section', 50);
        table.integer('position').defaultTo(0);
        table.timestamps(true, true);
        table.unique(['event_id', 'template_id']);
        table.index(['event_id']);
        table.index(['template_id']);
      });
      console.log('✓ event_ticket_templates table created');
    } else {
      console.log('✓ event_ticket_templates table already exists');
    }

    console.log('\n✓ All tables created successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error creating tables:', err.message);
    process.exit(1);
  }
}

createTables();
