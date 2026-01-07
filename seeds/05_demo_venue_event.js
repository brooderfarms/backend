/**
 * Demo seed: single venue + event used by frontend examples
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function(knex) {
  // Insert demo venue
  const venueData = {
    name: '7 Arts Theatre, Harare',
    description: 'Intimate theatre space hosting musicals, plays and cultural events in Harare.',
    address: '7 Arts Theatre Road',
    city: 'Harare',
    state: 'Harare',
    country: 'Zimbabwe',
    postal_code: '0010',
    latitude: -17.8276,
    longitude: 31.0420,
    capacity: 800,
    venue_type: 'theater',
    facilities: JSON.stringify(['Parking','Bar','Wheelchair Access','Sound System','Lighting']),
    layout: JSON.stringify({ main_auditorium: { capacity: 700, type: 'seated' }, balcony: { capacity: 100, type: 'seated' } }),
    has_seating: true,
    is_active: true,
    manager_id: null,
    contact_phone: '+263-24-700-777',
    contact_email: 'info@7artstheatre.co.zw',
    operating_hours: 'Tue-Sun: 09:00 - 22:00',
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  };

  const inserted = await knex('venues').insert(venueData).returning('id');
  const venueId = Array.isArray(inserted) ? (inserted[0].id || inserted[0]) : inserted;

  // Insert demo event tied to the venue
  await knex('events').insert({
    title: 'The Lion King Musical',
    description: 'A spectacular musical production full of music, dance and storytelling for the whole family.',
    short_description: 'Family musical at 7 Arts Theatre, Harare.',
    event_type: 'theater',
    category: 'arts',
    venue_id: venueId,
    organizer_id: null,
    start_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // one week from now
    end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000), // +3 hours
    base_price: 40.00,
    currency: 'USD',
    total_capacity: 800,
    available_tickets: 800,
    sold_tickets: 0,
    status: 'published',
    event_image_url: 'https://images.unsplash.com/photo-1503095392213-2e6d338dbbf0?w=1200',
    tags: JSON.stringify(['musical','family','theatre']),
    terms_and_conditions: 'Standard venue terms apply.',
    refund_policy: 'Full refund up to 7 days before event.',
    is_featured: true,
    requires_approval: false,
    min_age: 0,
    has_seating: true,
    published_at: knex.fn.now(),
    sales_start_date: knex.fn.now(),
    sales_end_date: knex.fn.now(),
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });

  console.log('✅ Demo venue and event seeded successfully');
};
