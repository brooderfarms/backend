const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const { validatePagination, validateUUID, validateTicketPurchase } = require('../middleware/validation');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { CartService } = require('../services/cartCheckoutService');

// Utility function to generate ticket codes based on format
async function generateTicketCodes(ticketNumber, eventId, userId, format) {
  const baseData = {
    ticketNumber,
    eventId,
    userId,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(8).toString('hex')
  };

  const codes = {
    qr_code_data: null,
    nfc_data: null,
    rfid_data: null
  };

  switch (format) {
    case 'qr_code':
      // Generate QR code data (JSON stringified)
      codes.qr_code_data = JSON.stringify({
        ...baseData,
        format: 'qr_code',
        validationKey: crypto.createHash('sha256').update(JSON.stringify(baseData)).digest('hex')
      });
      break;

    case 'nfc':
      // Generate NFC data (shorter format for NFC tags)
      const nfcPayload = {
        tn: ticketNumber,
        eid: eventId.substring(0, 8), // Shortened event ID
        uid: userId.substring(0, 8),  // Shortened user ID
        ts: Math.floor(Date.now() / 1000), // Unix timestamp
        sig: crypto.createHash('md5').update(ticketNumber + eventId + userId).digest('hex').substring(0, 8)
      };
      codes.nfc_data = Buffer.from(JSON.stringify(nfcPayload)).toString('base64');
      break;

    case 'rfid':
      // Generate RFID data (hex format for RFID chips)
      const rfidPayload = {
        ticket: ticketNumber,
        event: eventId,
        user: userId,
        issued: Date.now(),
        checksum: crypto.createHash('crc32').update(ticketNumber + eventId + userId).digest('hex')
      };
      codes.rfid_data = Buffer.from(JSON.stringify(rfidPayload)).toString('hex');
      break;

    case 'barcode':
      // Generate barcode data (numeric format)
      codes.qr_code_data = ticketNumber.replace(/[^0-9]/g, '') + Date.now().toString().slice(-6);
      break;

    default:
      // Default to QR code
      codes.qr_code_data = JSON.stringify({
        ...baseData,
        format: 'qr_code',
        validationKey: crypto.createHash('sha256').update(JSON.stringify(baseData)).digest('hex')
      });
  }

  return codes;
}

// Get user's tickets
router.get('/', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, event_id } = req.query;
    const offset = (page - 1) * limit;

    let query = db('tickets')
      .join('events', 'tickets.event_id', 'events.id')
      .where('tickets.user_id', req.user.id)
      .whereNull('tickets.deleted_at')
      .select([
        'tickets.*',
        'events.title as event_title',
        'events.start_date as event_start_date',
        'events.venue_id'
      ])
      .orderBy('tickets.created_at', 'desc');

    if (status) {
      query = query.where('tickets.status', status);
    }

    if (event_id) {
      query = query.where('tickets.event_id', event_id);
    }

    // Get total count
    const totalQuery = query.clone().clearSelect().clearOrder().count('* as count').first();
    const [tickets, total] = await Promise.all([
      query.limit(limit).offset(offset),
      totalQuery
    ]);

    res.json({
      success: true,
      data: {
        tickets,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.count),
          pages: Math.ceil(total.count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get tickets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tickets'
    });
  }
});

// Get ticket by ID
router.get('/:id', verifyToken, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await db('tickets')
      .join('events', 'tickets.event_id', 'events.id')
      .join('venues', 'events.venue_id', 'venues.id')
      .where('tickets.id', id)
      .whereNull('tickets.deleted_at')
      .select([
        'tickets.*',
        'events.title as event_title',
        'events.description as event_description',
        'events.start_date as event_start_date',
        'events.end_date as event_end_date',
        'events.event_type',
        'venues.name as venue_name',
        'venues.address as venue_address',
        'venues.city as venue_city'
      ])
      .first();

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check ownership
    if (ticket.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own tickets'
      });
    }

    res.json({
      success: true,
      data: ticket
    });
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket'
    });
  }
});

// Purchase tickets
router.post('/purchase', verifyToken, validateTicketPurchase, async (req, res) => {
  const trx = await db.transaction();

  try {
    const { event_id, ticket_type, ticket_format, quantity, seat_numbers, session_id } = req.body;

    // Get event details
    const event = await trx('events')
      .where({ id: event_id, status: 'published' })
      .whereNull('deleted_at')
      .first();

    if (!event) {
      await trx.rollback();
      return res.status(404).json({
        success: false,
        message: 'Event not found or not available for purchase'
      });
    }

    // If session_id is provided, validate and check session capacity
    let sessionData = null;
    if (session_id) {
      sessionData = await trx('event_sessions')
        .where({ id: session_id, event_id })
        .whereNull('deleted_at')
        .first();

      if (!sessionData) {
        await trx.rollback();
        return res.status(404).json({
          success: false,
          message: 'Session not found for this event'
        });
      }

      if (!sessionData.is_active) {
        await trx.rollback();
        return res.status(400).json({
          success: false,
          message: 'This session is not available for booking'
        });
      }

      // Check session capacity
      if (sessionData.available_seats < quantity) {
        await trx.rollback();
        return res.status(400).json({
          success: false,
          message: `Only ${sessionData.available_seats} seats available in this session`
        });
      }

      // Use session pricing if available
      const pricePerTicket = sessionData.base_price || event.base_price;
      const serviceFee = pricePerTicket * 0.1;
      const totalAmount = (pricePerTicket + serviceFee) * quantity;
    } else {
      // Use event-level capacity if no session is selected
      // Check available tickets overall
      const ticketsSold = await trx('tickets')
        .where('event_id', event_id)
        .whereIn('status', ['confirmed', 'used'])
        .count('id as count')
        .first();

      const availableTickets = event.total_capacity - parseInt(ticketsSold.count);

      if (availableTickets < quantity) {
        await trx.rollback();
        return res.status(400).json({
          success: false,
          message: `Only ${availableTickets} tickets available. Cannot purchase ${quantity} tickets.`
        });
      }
    }

    // Check if this is a streaming event
    const isStreamingEvent = event.is_streaming_event || false;

    // Check if event is in the future
    if (new Date(event.start_date) <= new Date()) {
      await trx.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot purchase tickets for past events'
      });
    }

    // Check ticket type inventory if available
    if (event.ticket_quantities && typeof event.ticket_quantities === 'object') {
      const availableOfType = event.ticket_quantities[ticket_type] || 0;
      
      // Count already sold tickets of this type
      const soldOfType = await trx('tickets')
        .where({ event_id, ticket_type })
        .whereIn('status', ['confirmed', 'used'])
        .count('id as count')
        .first();

      const remainingOfType = availableOfType - parseInt(soldOfType.count);

      if (remainingOfType < quantity) {
        await trx.rollback();
        return res.status(400).json({
          success: false,
          message: `Only ${remainingOfType} ${ticket_type} tickets available. Cannot purchase ${quantity} tickets.`
        });
      }
    }

    // Calculate pricing based on ticket type and session
    let pricePerTicket = sessionData ? sessionData.base_price : event.base_price;
    if (ticket_type === 'vip') pricePerTicket *= 2;
    else if (ticket_type === 'premium') pricePerTicket *= 1.5;

    const serviceFee = pricePerTicket * 0.1; // 10% service fee
    const totalAmount = (pricePerTicket + serviceFee) * quantity;

    // Create tickets
    const tickets = [];
    for (let i = 0; i < quantity; i++) {
      const ticketNumber = `TKT-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      // Determine digital format based on ticket format
      let digitalFormat = 'qr_code'; // default
      if (ticket_format === 'digital' && req.body.digital_format) {
        digitalFormat = req.body.digital_format;
      }

      // Generate appropriate codes based on format
      const codes = await generateTicketCodes(ticketNumber, event_id, req.user.id, digitalFormat);

      const ticketData = {
        event_id,
        user_id: req.user.id,
        ticket_number: ticketNumber,
        ticket_type,
        ticket_format,
        digital_format: digitalFormat,
        price: pricePerTicket,
        service_fee: serviceFee,
        total_amount: pricePerTicket + serviceFee,
        ...codes,
        status: 'reserved',
        valid_until: event.end_date,
        has_streaming_access: isStreamingEvent,
        stream_access_token: isStreamingEvent ? crypto.randomBytes(32).toString('hex') : null,
        can_watch_replay: isStreamingEvent ? event.allow_replay || false : false,
        stream_access_expires_at: isStreamingEvent ? event.replay_available_until || event.end_date : null
      };

      // Add session_id if provided
      if (session_id) {
        ticketData.session_id = session_id;
      }

      // Assign seat if specified
      if (seat_numbers && seat_numbers[i]) {
        ticketData.seat_number = seat_numbers[i];
      }

      const [ticket] = await trx('tickets').insert(ticketData).returning('*');
      tickets.push(ticket);
    }

    // If session was used, reserve seats
    if (session_id && sessionData) {
      const newAvailableSeats = sessionData.available_seats - quantity;
      await trx('event_sessions')
        .where({ id: session_id })
        .update({ available_seats: newAvailableSeats });
    }

    // Create payment record
    const paymentGatewayFee = req.body.gateway_fee || 0;
    const totalAmountWithFees = totalAmount + paymentGatewayFee;
    
    const [payment] = await trx('payments').insert({
      user_id: req.user.id,
      event_id,
      reference_number: `PAY-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      amount: totalAmount,
      currency: event.currency,
      gateway_fee: paymentGatewayFee,
      service_fee: 0,
      total_amount: totalAmountWithFees,
      payment_method: req.body.payment_method || 'stripe',
      status: 'pending',
      gateway: req.body.payment_method || 'stripe'
    }).returning('*');

    await trx.commit();

    // Log audit event
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'TICKETS_PURCHASED',
      resource: 'tickets',
      metadata: JSON.stringify({
        event_id,
        quantity,
        total_amount: totalAmount,
        payment_id: payment.id
      }),
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Tickets reserved successfully. Complete payment to confirm.',
      data: {
        tickets,
        payment,
        total_amount: totalAmount,
        expires_in: '15 minutes' // Reservation expires in 15 minutes
      }
    });
  } catch (error) {
    await trx.rollback();
    console.error('Purchase tickets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to purchase tickets'
    });
  }
});

// Confirm payment and tickets
router.post('/:id/confirm-payment', verifyToken, validateUUID, async (req, res) => {
  const trx = await db.transaction();

  try {
    const { id } = req.params;
    const { payment_method, gateway_response } = req.body;

    // Get ticket
    const ticket = await trx('tickets')
      .where({ id, user_id: req.user.id })
      .whereNull('deleted_at')
      .first();

    if (!ticket) {
      await trx.rollback();
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    if (ticket.status !== 'reserved') {
      await trx.rollback();
      return res.status(400).json({
        success: false,
        message: 'Ticket is not in reserved status'
      });
    }

    // Update ticket status
    await trx('tickets')
      .where({ id })
      .update({
        status: 'confirmed',
        updated_at: new Date()
      });

    // Update payment status
    // First, find the payment
    const existingPayment = await trx('payments')
      .where({
        user_id: req.user.id,
        event_id: ticket.event_id,
        status: 'pending'
      })
      .orderBy('created_at', 'desc')
      .first();

    if (!existingPayment) {
      await trx.rollback();
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    // Now update it
    await trx('payments')
      .where({ id: existingPayment.id })
      .update({
        status: 'completed',
        payment_method,
        gateway: payment_method === 'cash' ? 'cash' : 'stripe',
        gateway_response: JSON.stringify(gateway_response),
        completed_at: new Date()
      });

    const payment = existingPayment;

    await trx.commit();

    // Log audit event
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'PAYMENT_COMPLETED',
      resource: 'tickets',
      resource_id: id,
      metadata: JSON.stringify({
        payment_id: payment.id,
        amount: ticket.total_amount,
        payment_method
      }),
      timestamp: new Date()
    });

    // Clear cart after successful payment
    await CartService.clearCart(req.user.id);

    res.json({
      success: true,
      message: 'Payment confirmed and ticket activated',
      data: {
        ticket: { ...ticket, status: 'confirmed' },
        payment
      }
    });
  } catch (error) {
    await trx.rollback();
    console.error('Confirm payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm payment'
    });
  }
});

// Cancel ticket (before event)
router.put('/:id/cancel', verifyToken, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await db('tickets')
      .join('events', 'tickets.event_id', 'events.id')
      .where('tickets.id', id)
      .whereNull('tickets.deleted_at')
      .select(['tickets.*', 'events.start_date'])
      .first();

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check ownership
    if (ticket.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You can only cancel your own tickets'
      });
    }

    // Check if event is in the future
    if (new Date(ticket.start_date) <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel tickets for past or ongoing events'
      });
    }

    // Update ticket status
    await db('tickets')
      .where({ id })
      .update({
        status: 'cancelled',
        updated_at: new Date()
      });

    // Create refund record
    const refundPayments = await db('payments')
      .where({
        user_id: ticket.user_id,
        event_id: ticket.event_id,
        status: 'completed'
      })
      .orderBy('completed_at', 'desc')
      .limit(1)
      .update({
        status: 'refunded',
        refunded_amount: ticket.total_amount,
        refund_processed_at: new Date()
      })
      .returning('*');

    const refundPayment = refundPayments && refundPayments.length > 0 ? refundPayments[0] : null;

    // Log audit event
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'TICKET_CANCELLED',
      resource: 'tickets',
      resource_id: id,
      metadata: JSON.stringify({
        refund_amount: ticket.total_amount,
        payment_id: refundPayment ? refundPayment.id : null
      }),
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Ticket cancelled successfully. Refund will be processed.',
      data: {
        ticket: { ...ticket, status: 'cancelled' },
        refund_amount: ticket.total_amount
      }
    });
  } catch (error) {
    console.error('Cancel ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel ticket'
    });
  }
});

// Validate ticket (for entry)
router.post('/:id/validate', async (req, res) => {
  try {
    const { id } = req.params;
    const { qr_code_data, nfc_data } = req.body;

    let ticket;
    if (qr_code_data) {
      ticket = await db('tickets')
        .join('events', 'tickets.event_id', 'events.id')
        .where('tickets.qr_code_data', qr_code_data)
        .whereNull('tickets.deleted_at')
        .select(['tickets.*', 'events.title', 'events.start_date', 'events.end_date'])
        .first();
    } else if (nfc_data) {
      ticket = await db('tickets')
        .join('events', 'tickets.event_id', 'events.id')
        .where('tickets.nfc_data', nfc_data)
        .whereNull('tickets.deleted_at')
        .select(['tickets.*', 'events.title', 'events.start_date', 'events.end_date'])
        .first();
    } else {
      ticket = await db('tickets')
        .join('events', 'tickets.event_id', 'events.id')
        .where('tickets.id', id)
        .whereNull('tickets.deleted_at')
        .select(['tickets.*', 'events.title', 'events.start_date', 'events.end_date'])
        .first();
    }

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check if ticket is valid
    const now = new Date();
    const eventStart = new Date(ticket.start_date);
    const eventEnd = new Date(ticket.end_date);

    if (ticket.status !== 'confirmed') {
      return res.status(400).json({
        success: false,
        message: `Ticket is ${ticket.status}`,
        ticket: {
          id: ticket.id,
          status: ticket.status,
          event_title: ticket.title
        }
      });
    }

    if (now < eventStart) {
      return res.status(400).json({
        success: false,
        message: 'Event has not started yet',
        ticket: {
          id: ticket.id,
          event_title: ticket.title,
          event_start: ticket.start_date
        }
      });
    }

    if (now > eventEnd) {
      return res.status(400).json({
        success: false,
        message: 'Event has ended',
        ticket: {
          id: ticket.id,
          event_title: ticket.title,
          event_end: ticket.end_date
        }
      });
    }

    // Mark ticket as used
    await db('tickets')
      .where({ id: ticket.id })
      .update({
        status: 'used',
        updated_at: new Date()
      });

    // Log audit event
    await db('audit_logs').insert({
      action: 'TICKET_VALIDATED',
      resource: 'tickets',
      resource_id: ticket.id,
      metadata: JSON.stringify({
        validation_method: qr_code_data ? 'qr_code' : nfc_data ? 'nfc' : 'manual'
      }),
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Ticket validated successfully',
      data: {
        ticket: {
          id: ticket.id,
          ticket_number: ticket.ticket_number,
          event_title: ticket.title,
          seat_number: ticket.seat_number,
          validated_at: new Date()
        }
      }
    });
  } catch (error) {
    console.error('Validate ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate ticket'
    });
  }
});

// Get ticket QR code
router.get('/:id/qr-code', verifyToken, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await db('tickets')
      .where({ id, user_id: req.user.id })
      .whereNull('deleted_at')
      .first();

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    res.json({
      success: true,
      data: {
        ticket_number: ticket.ticket_number,
        qr_code_data: ticket.qr_code_data,
        event_id: ticket.event_id,
        valid_until: ticket.valid_until
      }
    });
  } catch (error) {
    console.error('Get QR code error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate QR code'
    });
  }
});

// Validate ticket by QR code
router.post('/validate/qr', async (req, res) => {
  try {
    const { qr_data } = req.body;

    if (!qr_data) {
      return res.status(400).json({
        success: false,
        message: 'QR code data is required'
      });
    }

    let parsedData;
    try {
      parsedData = JSON.parse(qr_data);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid QR code format'
      });
    }

    // Find ticket by QR code data
    const ticket = await db('tickets')
      .join('events', 'tickets.event_id', 'events.id')
      .join('users', 'tickets.user_id', 'users.id')
      .where('tickets.qr_code_data', qr_data)
      .whereNull('tickets.deleted_at')
      .select([
        'tickets.*',
        'events.title as event_title',
        'events.start_date as event_start_date',
        'events.end_date as event_end_date',
        'events.venue_id',
        'users.first_name',
        'users.last_name',
        'users.email'
      ])
      .first();

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check if ticket is valid
    const now = new Date();
    const validUntil = new Date(ticket.valid_until);

    if (ticket.status !== 'confirmed') {
      return res.status(403).json({
        success: false,
        message: `Ticket is ${ticket.status}`,
        ticket_status: ticket.status
      });
    }

    if (now > validUntil) {
      return res.status(403).json({
        success: false,
        message: 'Ticket has expired',
        expired: true
      });
    }

    // Log validation
    await db('audit_logs').insert({
      action: 'TICKET_VALIDATED',
      resource: 'tickets',
      resource_id: ticket.id,
      metadata: JSON.stringify({
        method: 'qr_code',
        event_title: ticket.event_title,
        validated_at: now.toISOString()
      }),
      timestamp: now
    });

    res.json({
      success: true,
      message: 'Ticket is valid',
      ticket: {
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        ticket_type: ticket.ticket_type,
        event_title: ticket.event_title,
        event_date: ticket.event_start_date,
        valid_until: ticket.valid_until,
        seat_info: ticket.seat_number ? `${ticket.seat_section} ${ticket.seat_row}${ticket.seat_number}` : null,
        owner: `${ticket.first_name} ${ticket.last_name}`
      }
    });

  } catch (error) {
    console.error('QR validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate ticket'
    });
  }
});

// Validate ticket by NFC
router.post('/validate/nfc', async (req, res) => {
  try {
    const { nfc_data } = req.body;

    if (!nfc_data) {
      return res.status(400).json({
        success: false,
        message: 'NFC data is required'
      });
    }

    // Find ticket by NFC data
    const ticket = await db('tickets')
      .join('events', 'tickets.event_id', 'events.id')
      .join('users', 'tickets.user_id', 'users.id')
      .where('tickets.nfc_data', nfc_data)
      .whereNull('tickets.deleted_at')
      .select([
        'tickets.*',
        'events.title as event_title',
        'events.start_date as event_start_date',
        'events.end_date as event_end_date',
        'users.first_name',
        'users.last_name'
      ])
      .first();

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check validation rules same as QR
    const now = new Date();
    const validUntil = new Date(ticket.valid_until);

    if (ticket.status !== 'confirmed') {
      return res.status(403).json({
        success: false,
        message: `Ticket is ${ticket.status}`,
        ticket_status: ticket.status
      });
    }

    if (now > validUntil) {
      return res.status(403).json({
        success: false,
        message: 'Ticket has expired',
        expired: true
      });
    }

    // Log validation
    await db('audit_logs').insert({
      action: 'TICKET_VALIDATED',
      resource: 'tickets',
      resource_id: ticket.id,
      metadata: JSON.stringify({
        method: 'nfc',
        event_title: ticket.event_title,
        validated_at: now.toISOString()
      }),
      timestamp: now
    });

    res.json({
      success: true,
      message: 'Ticket is valid',
      ticket: {
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        ticket_type: ticket.ticket_type,
        event_title: ticket.event_title,
        event_date: ticket.event_start_date,
        valid_until: ticket.valid_until,
        seat_info: ticket.seat_number ? `${ticket.seat_section} ${ticket.seat_row}${ticket.seat_number}` : null,
        owner: `${ticket.first_name} ${ticket.last_name}`
      }
    });

  } catch (error) {
    console.error('NFC validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate ticket'
    });
  }
});

// Validate ticket by RFID
router.post('/validate/rfid', async (req, res) => {
  try {
    const { rfid_data } = req.body;

    if (!rfid_data) {
      return res.status(400).json({
        success: false,
        message: 'RFID data is required'
      });
    }

    // Find ticket by RFID data
    const ticket = await db('tickets')
      .join('events', 'tickets.event_id', 'events.id')
      .join('users', 'tickets.user_id', 'users.id')
      .where('tickets.rfid_data', rfid_data)
      .whereNull('tickets.deleted_at')
      .select([
        'tickets.*',
        'events.title as event_title',
        'events.start_date as event_start_date',
        'events.end_date as event_end_date',
        'users.first_name',
        'users.last_name'
      ])
      .first();

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check validation rules
    const now = new Date();
    const validUntil = new Date(ticket.valid_until);

    if (ticket.status !== 'confirmed') {
      return res.status(403).json({
        success: false,
        message: `Ticket is ${ticket.status}`,
        ticket_status: ticket.status
      });
    }

    if (now > validUntil) {
      return res.status(403).json({
        success: false,
        message: 'Ticket has expired',
        expired: true
      });
    }

    // Log validation
    await db('audit_logs').insert({
      action: 'TICKET_VALIDATED',
      resource: 'tickets',
      resource_id: ticket.id,
      metadata: JSON.stringify({
        method: 'rfid',
        event_title: ticket.event_title,
        validated_at: now.toISOString()
      }),
      timestamp: now
    });

    res.json({
      success: true,
      message: 'Ticket is valid',
      ticket: {
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        ticket_type: ticket.ticket_type,
        event_title: ticket.event_title,
        event_date: ticket.event_start_date,
        valid_until: ticket.valid_until,
        seat_info: ticket.seat_number ? `${ticket.seat_section} ${ticket.seat_row}${ticket.seat_number}` : null,
        owner: `${ticket.first_name} ${ticket.last_name}`
      }
    });

  } catch (error) {
    console.error('RFID validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate ticket'
    });
  }
});

// Get ticket QR code image
router.get('/:id/qr', verifyToken, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await db('tickets')
      .where('id', id)
      .where('user_id', req.user.id)
      .whereNull('deleted_at')
      .first();

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    if (!ticket.qr_code_data) {
      return res.status(400).json({
        success: false,
        message: 'QR code not available for this ticket'
      });
    }

    // Generate QR code as data URL
    const qrCodeDataURL = await QRCode.toDataURL(ticket.qr_code_data, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    res.json({
      success: true,
      qr_code: qrCodeDataURL,
      ticket_number: ticket.ticket_number
    });

  } catch (error) {
    console.error('QR code generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate QR code'
    });
  }
});

module.exports = router;
