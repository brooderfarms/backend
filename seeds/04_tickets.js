const crypto = require('crypto');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function(knex) {
  // Clear existing entries
  await knex('tickets').del();

  // Get user and event IDs
  const customers = await knex('users').where('role', 'customer').limit(3);
  const techSummit = await knex('events').where('title', 'Tech Innovation Summit 2024').first();
  const musicAwards = await knex('events').where('title', 'Zimbabwe Music Awards 2024 - Live Stream').first();
  const footballMatch = await knex('events').where('title', 'Highlanders FC vs Dynamos FC').first();

  // Insert sample tickets
  const tickets = [];

  // Tech Summit tickets
  if (customers[0] && techSummit) {
    tickets.push({
      event_id: techSummit.id,
      user_id: customers[0].id,
      ticket_number: 'TKT-2024-001',
      ticket_type: 'standard',
      ticket_format: 'digital',
      price: 150.00,
      service_fee: 15.00,
      total_amount: 165.00,
      qr_code_data: crypto.randomBytes(16).toString('hex'),
      status: 'confirmed',
      purchase_date: new Date('2024-01-15T10:30:00Z'),
      valid_until: techSummit.end_date,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    });

    tickets.push({
      event_id: techSummit.id,
      user_id: customers[0].id,
      ticket_number: 'TKT-2024-002',
      ticket_type: 'vip',
      ticket_format: 'digital',
      price: 300.00, // 2x base price for VIP
      service_fee: 30.00,
      total_amount: 330.00,
      qr_code_data: crypto.randomBytes(16).toString('hex'),
      status: 'confirmed',
      purchase_date: new Date('2024-01-15T10:30:00Z'),
      valid_until: techSummit.end_date,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    });
  }

  // Music Awards streaming tickets
  if (customers[1] && musicAwards) {
    tickets.push({
      event_id: musicAwards.id,
      user_id: customers[1].id,
      ticket_number: 'STREAM-2024-001',
      ticket_type: 'standard',
      ticket_format: 'digital',
      price: 15.00,
      service_fee: 1.50,
      total_amount: 16.50,
      qr_code_data: crypto.randomBytes(16).toString('hex'),
      status: 'confirmed',
      purchase_date: new Date('2024-03-15T14:20:00Z'),
      valid_until: musicAwards.end_date,
      has_streaming_access: true,
      stream_access_token: crypto.randomBytes(32).toString('hex'),
      can_watch_replay: true,
      stream_access_granted_at: new Date('2024-03-15T14:20:00Z'),
      stream_access_expires_at: musicAwards.replay_available_until,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    });
  }

  // Football match tickets
  if (customers[2] && footballMatch) {
    tickets.push({
      event_id: footballMatch.id,
      user_id: customers[2].id,
      ticket_number: 'FOOT-2024-001',
      ticket_type: 'standard',
      ticket_format: 'physical',
      seat_number: 'A12',
      seat_row: 'A',
      seat_section: 'North Stand',
      price: 25.00,
      service_fee: 2.50,
      total_amount: 27.50,
      qr_code_data: crypto.randomBytes(16).toString('hex'),
      status: 'confirmed',
      purchase_date: new Date('2024-02-20T16:45:00Z'),
      valid_until: footballMatch.end_date,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    });

    tickets.push({
      event_id: footballMatch.id,
      user_id: customers[2].id,
      ticket_number: 'FOOT-2024-002',
      ticket_type: 'vip',
      ticket_format: 'digital',
      seat_number: 'VIP05',
      seat_row: 'VIP',
      seat_section: 'Executive Box',
      price: 50.00, // 2x base price for VIP
      service_fee: 5.00,
      total_amount: 55.00,
      qr_code_data: crypto.randomBytes(16).toString('hex'),
      status: 'confirmed',
      purchase_date: new Date('2024-02-20T16:45:00Z'),
      valid_until: footballMatch.end_date,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    });
  }

  // Insert tickets
  if (tickets.length > 0) {
    await knex('tickets').insert(tickets);
  }

  // Update event sold tickets count
  if (techSummit) {
    const techTicketsSold = tickets.filter(t => t.event_id === techSummit.id).length;
    await knex('events')
      .where('id', techSummit.id)
      .update({
        sold_tickets: techTicketsSold,
        available_tickets: techSummit.total_capacity - techTicketsSold
      });
  }

  if (musicAwards) {
    const musicTicketsSold = tickets.filter(t => t.event_id === musicAwards.id).length;
    await knex('events')
      .where('id', musicAwards.id)
      .update({
        sold_tickets: musicTicketsSold,
        available_tickets: musicAwards.total_capacity - musicTicketsSold
      });
  }

  if (footballMatch) {
    const footballTicketsSold = tickets.filter(t => t.event_id === footballMatch.id).length;
    await knex('events')
      .where('id', footballMatch.id)
      .update({
        sold_tickets: footballTicketsSold,
        available_tickets: footballMatch.total_capacity - footballTicketsSold
      });
  }

  console.log('✅ Tickets seeded successfully');
};
