/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function(knex) {
  // Clear existing entries
  await knex('venues').del();

  // Insert seed venues
  await knex('venues').insert([
    {
      name: 'Harare International Conference Centre',
      description: 'Premier conference and exhibition venue in Zimbabwe, hosting major corporate events, concerts, and international conferences.',
      address: 'Corner Samora Machel Avenue & Kenneth Kaunda Road',
      city: 'Harare',
      state: 'Harare',
      country: 'Zimbabwe',
      postal_code: '0001',
      latitude: -17.8252,
      longitude: 31.0335,
      capacity: 5000,
      venue_type: 'conference_center',
      facilities: JSON.stringify([
        'WiFi', 'Parking', 'Catering', 'AV Equipment', 'Stage', 'Sound System',
        'Projectors', 'Microphones', 'Lighting', 'Restrooms', 'Security'
      ]),
      layout: JSON.stringify({
        main_hall: { capacity: 3000, type: 'theater' },
        breakout_rooms: { count: 10, capacity_each: 50 },
        exhibition_space: { area_sqm: 2000 }
      }),
      has_seating: true,
      is_active: true,
      manager_id: null, // Will be updated to UUID after insertion
      contact_phone: '+263-24-700-000',
      contact_email: 'info@harareconferences.co.zw',
      operating_hours: 'Monday-Friday: 8:00 AM - 6:00 PM, Saturday: 9:00 AM - 4:00 PM',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      name: 'Barbourfields Stadium',
      description: 'Historic sports stadium in Bulawayo, home to major football matches and athletics events.',
      address: 'Selborne Avenue',
      city: 'Bulawayo',
      state: 'Bulawayo',
      country: 'Zimbabwe',
      postal_code: '0026',
      latitude: -20.1550,
      longitude: 28.5829,
      capacity: 32000,
      venue_type: 'stadium',
      facilities: JSON.stringify([
        'Changing Rooms', 'Floodlights', 'Scoreboard', 'Parking', 'Concessions',
        'First Aid', 'Security', 'Public Transport Access', 'Disabled Access'
      ]),
      layout: JSON.stringify({
        main_stand: { capacity: 8000, type: 'seated' },
        opposite_stand: { capacity: 12000, type: 'seated' },
        ends: { capacity: 12000, type: 'standing' },
        vip_boxes: { count: 20, capacity_each: 10 }
      }),
      has_seating: true,
      is_active: true,
      manager_id: null, // Will be updated to UUID
      contact_phone: '+263-29-123-456',
      contact_email: 'bookings@bulawayostadium.co.zw',
      operating_hours: 'Match days and events only',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      name: 'National Sports Stadium',
      description: 'Zimbabwe\'s national stadium, hosting international football matches, rugby, and major sporting events.',
      address: '74 Fife Avenue',
      city: 'Harare',
      state: 'Harare',
      country: 'Zimbabwe',
      postal_code: '0001',
      latitude: -17.8292,
      longitude: 31.0529,
      capacity: 60000,
      venue_type: 'stadium',
      facilities: JSON.stringify([
        'Floodlights', 'Electronic Scoreboard', 'VIP Lounges', 'Press Box',
        'Parking', 'Concessions', 'Medical Facilities', 'Security', 'Broadcast Facilities'
      ]),
      layout: JSON.stringify({
        main_stand: { capacity: 15000, type: 'seated' },
        opposite_stand: { capacity: 20000, type: 'seated' },
        ends: { capacity: 25000, type: 'mixed' },
        vip_area: { capacity: 1000, type: 'seated' }
      }),
      has_seating: true,
      is_active: true,
      manager_id: null, // Will be updated to UUID
      contact_phone: '+263-24-123-789',
      contact_email: 'events@nationalstadium.co.zw',
      operating_hours: 'Event-based, security 24/7',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      name: 'The Theatre In The Park',
      description: 'Beautiful outdoor theater venue in Harare, perfect for concerts, plays, and cultural performances.',
      address: 'Julius Nyerere Way',
      city: 'Harare',
      state: 'Harare',
      country: 'Zimbabwe',
      postal_code: '0002',
      latitude: -17.8308,
      longitude: 31.0508,
      capacity: 1200,
      venue_type: 'theater',
      facilities: JSON.stringify([
        'Stage Lighting', 'Sound System', 'Orchestra Pit', 'Dressing Rooms',
        'Green Room', 'Bar', 'Parking', 'Restrooms', 'Wheelchair Access'
      ]),
      layout: JSON.stringify({
        main_auditorium: { capacity: 800, type: 'seated' },
        balcony: { capacity: 300, type: 'seated' },
        standing_area: { capacity: 100, type: 'standing' }
      }),
      has_seating: true,
      is_active: true,
      manager_id: null, // No specific manager assigned
      contact_phone: '+263-24-987-654',
      contact_email: 'bookings@theatreinthepark.co.zw',
      operating_hours: 'Tuesday-Sunday: 10:00 AM - 10:00 PM',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      name: 'Rainbow Towers Conference Centre',
      description: 'Modern conference facility in downtown Harare with state-of-the-art technology and catering services.',
      address: 'Cnr 1st Street & Jason Moyo Avenue',
      city: 'Harare',
      state: 'Harare',
      country: 'Zimbabwe',
      postal_code: '0001',
      latitude: -17.8258,
      longitude: 31.0339,
      capacity: 800,
      venue_type: 'conference_center',
      facilities: JSON.stringify([
        'WiFi', 'AV Equipment', 'Projectors', 'Microphones', 'Sound System',
        'Catering Kitchen', 'Parking', 'Security', 'Air Conditioning', 'Restrooms'
      ]),
      layout: JSON.stringify({
        main_hall: { capacity: 500, type: 'theater' },
        boardroom: { capacity: 20, type: 'boardroom' },
        meeting_rooms: { count: 3, capacity_each: 50 },
        foyer: { capacity: 100, type: 'reception' }
      }),
      has_seating: true,
      is_active: true,
      manager_id: null,
      contact_phone: '+263-24-555-123',
      contact_email: 'conferences@rainbowtowers.co.zw',
      operating_hours: 'Monday-Saturday: 8:00 AM - 8:00 PM',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      name: 'Victoria Falls Conference Centre',
      description: 'Scenic conference venue near Victoria Falls, perfect for team building and corporate retreats.',
      address: 'Victoria Falls Town',
      city: 'Victoria Falls',
      state: 'Matabeleland North',
      country: 'Zimbabwe',
      postal_code: '2630',
      latitude: -17.9318,
      longitude: 25.8308,
      capacity: 400,
      venue_type: 'conference_center',
      facilities: JSON.stringify([
        'WiFi', 'AV Equipment', 'Catering', 'Accommodation Access', 'Pool',
        'Garden', 'Parking', 'Security', 'Air Conditioning', 'Scenic Views'
      ]),
      layout: JSON.stringify({
        conference_room: { capacity: 200, type: 'theater' },
        breakout_rooms: { count: 4, capacity_each: 50 },
        outdoor_space: { capacity: 150, type: 'outdoor' }
      }),
      has_seating: true,
      is_active: true,
      manager_id: null,
      contact_phone: '+263-13-123-456',
      contact_email: 'events@victoriafallsconferences.co.zw',
      operating_hours: 'Monday-Sunday: 7:00 AM - 10:00 PM',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      name: 'Robert Gabriel Mugabe International Airport',
      description: 'International airport terminal for air travel events and corporate aviation.',
      address: 'Harare International Airport',
      city: 'Harare',
      state: 'Harare',
      country: 'Zimbabwe',
      postal_code: '0001',
      latitude: -17.9319,
      longitude: 31.0928,
      capacity: 2000,
      venue_type: 'airport',
      facilities: JSON.stringify([
        'Check-in Counters', 'Security', 'Customs', 'Duty Free', 'Restaurants',
        'WiFi', 'Charging Stations', 'Information Desks', 'Currency Exchange'
      ]),
      layout: JSON.stringify({
        departure_lounge: { capacity: 1000, type: 'waiting_area' },
        arrival_hall: { capacity: 800, type: 'reception' },
        vip_lounge: { capacity: 50, type: 'lounge' },
        conference_room: { capacity: 150, type: 'meeting' }
      }),
      has_seating: true,
      is_active: true,
      manager_id: null,
      contact_phone: '+263-24-575-111',
      contact_email: 'events@hnl.co.zw',
      operating_hours: '24/7 Airport Operations',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      name: 'Bulawayo City Hall',
      description: 'Historic municipal building in Bulawayo, used for concerts, weddings, and civic events.',
      address: '8th Avenue & Fort Street',
      city: 'Bulawayo',
      state: 'Bulawayo',
      country: 'Zimbabwe',
      postal_code: '0026',
      latitude: -20.1606,
      longitude: 28.5844,
      capacity: 1500,
      venue_type: 'concert_hall',
      facilities: JSON.stringify([
        'Grand Piano', 'Stage', 'Sound System', 'Lighting', 'Dressing Rooms',
        'Parking', 'Catering Access', 'Security', 'Wheelchair Access', 'Bar'
      ]),
      layout: JSON.stringify({
        main_hall: { capacity: 1200, type: 'theater' },
        foyer: { capacity: 200, type: 'reception' },
        balcony: { capacity: 100, type: 'seated' }
      }),
      has_seating: true,
      is_active: true,
      manager_id: null,
      contact_phone: '+263-29-987-654',
      contact_email: 'events@bulawayocityhall.co.zw',
      operating_hours: 'Monday-Friday: 8:00 AM - 5:00 PM, Events: Flexible',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      name: 'Mvumbwe Hall',
      description: 'Contemporary events hall in Harare with modern facilities and flexible seating arrangements for various event types.',
      address: '45 Samora Machel Avenue',
      city: 'Harare',
      state: 'Harare',
      country: 'Zimbabwe',
      postal_code: '0001',
      latitude: -17.8245,
      longitude: 31.0325,
      capacity: 600,
      venue_type: 'concert_hall',
      facilities: JSON.stringify([
        'Stage', 'Sound System', 'Projectors', 'WiFi', 'Parking', 'Bar',
        'Catering Kitchen', 'Dressing Rooms', 'Security', 'Air Conditioning'
      ]),
      layout: JSON.stringify({
        main_hall: { capacity: 500, type: 'theater' },
        foyer: { capacity: 100, type: 'reception' }
      }),
      has_seating: true,
      is_active: true,
      manager_id: null,
      contact_phone: '+263-24-777-888',
      contact_email: 'bookings@mvumbwehall.co.zw',
      operating_hours: 'Monday-Sunday: 9:00 AM - 10:00 PM',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      name: 'Chitungwiza Sports Complex',
      description: 'Multi-purpose sports facility in Chitungwiza with modern amenities for athletic events and competitions.',
      address: 'Watherston Road',
      city: 'Chitungwiza',
      state: 'Harare',
      country: 'Zimbabwe',
      postal_code: '0004',
      latitude: -17.9925,
      longitude: 31.1289,
      capacity: 8000,
      venue_type: 'sports_complex',
      facilities: JSON.stringify([
        'Indoor Track', 'Basketball Courts', 'Volleyball Courts', 'Swimming Pool',
        'Gymnastics Hall', 'Martial Arts Studio', 'Parking', 'Spectator Seating', 'Medical Facilities'
      ]),
      layout: JSON.stringify({
        main_arena: { capacity: 5000, type: 'arena' },
        training_courts: { count: 6, capacity_each: 200 },
        pool_facilities: { capacity: 300, type: 'swimming' }
      }),
      has_seating: true,
      is_active: true,
      manager_id: null,
      contact_phone: '+263-24-999-123',
      contact_email: 'events@chitungwiza-sports.co.zw',
      operating_hours: 'Monday-Sunday: 6:00 AM - 10:00 PM',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      name: 'Gwanzura Stadium',
      description: 'Soccer-specific stadium in Harare used for club and international football matches.',
      address: 'Highfield, Harare',
      city: 'Harare',
      state: 'Harare',
      country: 'Zimbabwe',
      postal_code: '0008',
      latitude: -17.8512,
      longitude: 31.0245,
      capacity: 15000,
      venue_type: 'stadium',
      facilities: JSON.stringify([
        'Floodlights', 'Scoreboard', 'Changing Rooms', 'VIP Boxes', 'Parking',
        'Concessions', 'First Aid', 'Security', 'Media Center', 'Commentary Box'
      ]),
      layout: JSON.stringify({
        main_stand: { capacity: 6000, type: 'seated' },
        opposite_stand: { capacity: 5000, type: 'seated' },
        ends: { capacity: 4000, type: 'standing' }
      }),
      has_seating: true,
      is_active: true,
      manager_id: null,
      contact_phone: '+263-24-444-555',
      contact_email: 'bookings@gwanzura.co.zw',
      operating_hours: 'Match days and events',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      name: 'The Harare Gardens',
      description: 'Beautiful outdoor venue in Harare perfect for festivals, outdoor concerts, and garden events.',
      address: 'Avondale, Harare',
      city: 'Harare',
      state: 'Harare',
      country: 'Zimbabwe',
      postal_code: '0011',
      latitude: -17.8165,
      longitude: 31.0112,
      capacity: 3000,
      venue_type: 'other',
      facilities: JSON.stringify([
        'Outdoor Stage', 'Sound System', 'Lighting', 'Gardens', 'Catering',
        'Parking', 'Security', 'Restrooms', 'Green Space', 'Picnic Areas'
      ]),
      layout: JSON.stringify({
        main_stage: { capacity: 1500, type: 'outdoor_standing' },
        garden_seating: { capacity: 1000, type: 'seated_lawn' },
        vip_area: { capacity: 500, type: 'vip_seated' }
      }),
      has_seating: false,
      is_active: true,
      manager_id: null,
      contact_phone: '+263-24-666-777',
      contact_email: 'events@hararegardens.co.zw',
      operating_hours: 'Monday-Sunday: 8:00 AM - 10:00 PM',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      name: 'Mutare Civic Centre',
      description: 'State-of-the-art civic centre in Mutare serving the Eastern region of Zimbabwe for conferences, concerts, and cultural events.',
      address: 'Main Street, Mutare',
      city: 'Mutare',
      state: 'Manicaland',
      country: 'Zimbabwe',
      postal_code: '0150',
      latitude: -18.9673,
      longitude: 32.6669,
      capacity: 1000,
      venue_type: 'conference_center',
      facilities: JSON.stringify([
        'Auditorium', 'Conference Rooms', 'Stage', 'Sound System', 'WiFi',
        'Parking', 'Catering', 'Security', 'AV Equipment', 'Dressing Rooms'
      ]),
      layout: JSON.stringify({
        main_auditorium: { capacity: 700, type: 'theater' },
        conference_rooms: { count: 3, capacity_each: 100 }
      }),
      has_seating: true,
      is_active: true,
      manager_id: null,
      contact_phone: '+263-20-126-456',
      contact_email: 'events@mutarecivicentre.co.zw',
      operating_hours: 'Monday-Saturday: 8:00 AM - 8:00 PM',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      name: 'Kwekwe Mining Theatre',
      description: 'Historic theatre in the mining city of Kwekwe, host to dramatic productions and cultural performances.',
      address: 'Roberts Street, Kwekwe',
      city: 'Kwekwe',
      state: 'Midlands',
      country: 'Zimbabwe',
      postal_code: '0120',
      latitude: -18.9243,
      longitude: 29.8165,
      capacity: 800,
      venue_type: 'theater',
      facilities: JSON.stringify([
        'Stage', 'Lighting', 'Sound System', 'Orchestra Pit', 'Dressing Rooms',
        'Box Office', 'Bar', 'Parking', 'Restrooms'
      ]),
      layout: JSON.stringify({
        main_stage: { capacity: 600, type: 'theater' },
        balcony: { capacity: 200, type: 'seated' }
      }),
      has_seating: true,
      is_active: true,
      manager_id: null,
      contact_phone: '+263-25-121-234',
      contact_email: 'bookings@kwekwetheatre.co.zw',
      operating_hours: 'Tuesday-Sunday: 10:00 AM - 10:00 PM',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    }
  ]);

  // Update manager_id references to actual UUIDs
  const venueManager = await knex('users').where('email', 'venue@example.com').first();
  const bulawayoManager = await knex('users').where('email', 'manager@bulawayostadium.co.zw').first();
  const nationalManager = await knex('users').where('email', 'sports@nationalstadium.zw').first();

  if (venueManager) {
    await knex('venues')
      .where('contact_email', 'info@harareconferences.co.zw')
      .update({ manager_id: venueManager.id });
  }

  if (bulawayoManager) {
    await knex('venues')
      .where('contact_email', 'bookings@bulawayostadium.co.zw')
      .update({ manager_id: bulawayoManager.id });
  }

  if (nationalManager) {
    await knex('venues')
      .where('contact_email', 'events@nationalstadium.co.zw')
      .update({ manager_id: nationalManager.id });
  }

  console.log('✅ Venues seeded successfully');
};
