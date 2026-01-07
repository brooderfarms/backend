/**
 * Add comprehensive virtual events support
 * Supports: Workshops, Training, Conferences, Seminars, Business Conferences, 
 * Cultural Festivals, Health Camps, Bootcamps, and more
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('events', function(table) {
    // Virtual event mode
    table.enum('event_mode', ['in_person', 'virtual', 'hybrid']).defaultTo('in_person');
    
    // Virtual event type - specific categories
    table.enum('virtual_event_type', [
      'workshop',
      'training',
      'webinar',
      'seminar',
      'conference',
      'business_conference',
      'cultural_festival',
      'health_camp',
      'bootcamp',
      'masterclass',
      'networking_event',
      'product_launch',
      'panel_discussion',
      'expo',
      'virtual_tour',
      'online_course',
      'class',
      'lecture',
      'other'
    ]);

    // Virtual event details
    table.string('meeting_platform', 100); // zoom, google_meet, teams, custom, etc.
    table.string('meeting_link', 500); // Direct link to virtual event
    table.string('meeting_id', 255); // Meeting ID for the platform
    table.string('meeting_password', 255); // Password if required
    table.string('recording_url', 500); // Link to recorded event
    table.integer('max_attendees'); // Max capacity for virtual event
    table.text('technical_requirements'); // Browser, software, bandwidth requirements
    table.text('access_instructions'); // How to join the virtual event
    table.boolean('requires_registration').defaultTo(true);
    table.boolean('sends_reminder_email').defaultTo(true);
    table.integer('reminder_hours_before').defaultTo(24); // Send reminder X hours before
    table.boolean('chat_enabled').defaultTo(true);
    table.boolean('screen_share_enabled').defaultTo(true);
    table.boolean('breakout_rooms_enabled').defaultTo(false);
    table.boolean('q_and_a_enabled').defaultTo(true);
    table.boolean('polling_enabled').defaultTo(false);
    table.boolean('recording_available_after_event').defaultTo(true);
    table.boolean('auto_record').defaultTo(true);

    // Hybrid event fields (when both in-person and virtual)
    table.boolean('allow_virtual_attendees').defaultTo(false);
    table.decimal('virtual_ticket_price', 10, 2); // Different price for virtual access
    table.integer('virtual_capacity'); // Separate capacity for virtual attendees

    // Instructor/Host information
    table.string('host_name', 255); // Main host name
    table.string('host_email', 255); // Host email
    table.string('host_bio', 1000); // Host biography
    table.string('host_image_url', 500); // Host photo
    table.jsonb('additional_speakers'); // Array of speakers: {name, bio, image_url}
    table.jsonb('learning_objectives'); // Array of learning objectives

    // Certificates and completion
    table.boolean('provides_certificate').defaultTo(false);
    table.string('certificate_template_url', 500); // Template for certificate
    table.text('certificate_text'); // Text to include in certificate
    table.string('issuing_organization', 255); // Organization issuing certificate

    // Engagement metrics
    table.integer('average_rating').defaultTo(0); // 1-5 star rating
    table.integer('total_reviews').defaultTo(0);
    table.integer('completion_percentage').defaultTo(0); // Average completion %
    table.jsonb('metadata'); // Flexible field for additional data

    // Indexes for virtual events
    table.index(['event_mode']);
    table.index(['virtual_event_type']);
    table.index(['meeting_platform']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('events', function(table) {
    table.dropIndex(['event_mode']);
    table.dropIndex(['virtual_event_type']);
    table.dropIndex(['meeting_platform']);
    
    table.dropColumn('event_mode');
    table.dropColumn('virtual_event_type');
    table.dropColumn('meeting_platform');
    table.dropColumn('meeting_link');
    table.dropColumn('meeting_id');
    table.dropColumn('meeting_password');
    table.dropColumn('recording_url');
    table.dropColumn('max_attendees');
    table.dropColumn('technical_requirements');
    table.dropColumn('access_instructions');
    table.dropColumn('requires_registration');
    table.dropColumn('sends_reminder_email');
    table.dropColumn('reminder_hours_before');
    table.dropColumn('chat_enabled');
    table.dropColumn('screen_share_enabled');
    table.dropColumn('breakout_rooms_enabled');
    table.dropColumn('q_and_a_enabled');
    table.dropColumn('polling_enabled');
    table.dropColumn('recording_available_after_event');
    table.dropColumn('auto_record');
    table.dropColumn('allow_virtual_attendees');
    table.dropColumn('virtual_ticket_price');
    table.dropColumn('virtual_capacity');
    table.dropColumn('host_name');
    table.dropColumn('host_email');
    table.dropColumn('host_bio');
    table.dropColumn('host_image_url');
    table.dropColumn('additional_speakers');
    table.dropColumn('learning_objectives');
    table.dropColumn('provides_certificate');
    table.dropColumn('certificate_template_url');
    table.dropColumn('certificate_text');
    table.dropColumn('issuing_organization');
    table.dropColumn('average_rating');
    table.dropColumn('total_reviews');
    table.dropColumn('completion_percentage');
    table.dropColumn('metadata');
  });
};
