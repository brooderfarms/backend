const QRCode = require('qrcode');
const crypto = require('crypto');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class TicketService {
  /**
   * Generate unique ticket number
   */
  async generateTicketNumber(eventId) {
    try {
      const timestamp = Date.now().toString().slice(-8);
      const randomStr = crypto.randomBytes(4).toString('hex').toUpperCase();
      const ticketNumber = `TKT-${timestamp}-${randomStr}`;

      // Ensure uniqueness
      const exists = await db('tickets')
        .where('ticket_number', ticketNumber)
        .first();

      if (exists) {
        return this.generateTicketNumber(eventId);
      }

      return ticketNumber;
    } catch (error) {
      console.error('Error generating ticket number:', error);
      throw error;
    }
  }

  /**
   * Generate QR Code data and image
   */
  async generateQRCode(ticketData) {
    try {
      const qrData = JSON.stringify({
        ticketNumber: ticketData.ticketNumber,
        eventId: ticketData.eventId,
        userId: ticketData.userId,
        timestamp: Date.now(),
        hash: crypto.randomBytes(8).toString('hex')
      });

      // Generate QR code as data URL
      const qrCodeDataUrl = await QRCode.toDataURL(qrData);
      
      // Generate QR code as image buffer (for email)
      const qrCodeBuffer = await QRCode.toBuffer(qrData, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        quality: 0.95,
        margin: 1,
        width: 300
      });

      return {
        dataUrl: qrCodeDataUrl,
        buffer: qrCodeBuffer,
        rawData: qrData
      };
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw error;
    }
  }

  /**
   * Generate NFC data
   */
  async generateNFCData(ticketData) {
    try {
      const nfcData = {
        ticketNumber: ticketData.ticketNumber,
        eventId: ticketData.eventId,
        userId: ticketData.userId,
        seatInfo: ticketData.seatInfo || null,
        validity: {
          startDate: ticketData.validFrom,
          endDate: ticketData.validUntil
        },
        encryptionKey: crypto.randomBytes(16).toString('hex'),
        timestamp: Date.now()
      };

      // Encrypt sensitive data
      const encryptedData = this.encryptData(JSON.stringify(nfcData));

      return {
        rawData: nfcData,
        encryptedData: encryptedData,
        dataString: this.formatNFCDataString(nfcData)
      };
    } catch (error) {
      console.error('Error generating NFC data:', error);
      throw error;
    }
  }

  /**
   * Generate RFID data
   */
  async generateRFIDData(ticketData) {
    try {
      // RFID data is typically simpler due to storage limitations
      const rfidData = {
        ticketNumber: ticketData.ticketNumber,
        eventId: ticketData.eventId,
        userId: ticketData.userId,
        type: 'rfid',
        timestamp: Date.now()
      };

      // Create compact format for RFID (limited storage)
      const compactData = `RFID|${rfidData.ticketNumber}|${rfidData.eventId}|${rfidData.userId}`;
      
      // Encrypt for security
      const encryptedData = this.encryptData(compactData);

      return {
        rawData: rfidData,
        encryptedData: encryptedData,
        compactString: compactData
      };
    } catch (error) {
      console.error('Error generating RFID data:', error);
      throw error;
    }
  }

  /**
   * Generate barcode data
   */
  async generateBarcodeData(ticketData) {
    try {
      const barcodeData = {
        ticketNumber: ticketData.ticketNumber,
        eventId: ticketData.eventId,
        checksum: this.generateChecksum(ticketData.ticketNumber),
        timestamp: Date.now()
      };

      return {
        rawData: barcodeData,
        dataString: barcodeData.ticketNumber + barcodeData.checksum
      };
    } catch (error) {
      console.error('Error generating barcode data:', error);
      throw error;
    }
  }

  /**
   * Create ticket with all formats
   */
  async createTicket(ticketData) {
    try {
      const {
        eventId,
        event_id,
        userId,
        user_id,
        ticketType,
        ticket_type,
        ticketFormat = 'digital', // digital or physical
        digitalFormat = 'qr_code', // qr_code, nfc, rfid, barcode
        seatNumber,
        seat_number,
        seatRow,
        seat_row,
        seatSection,
        seat_section,
        price,
        servicefee = 0,
        status,
        currency = 'USD'
      } = ticketData;

      // Handle both camelCase and snake_case
      const finalEventId = eventId || event_id;
      const finalUserId = userId || user_id;
      const finalTicketType = ticketType || ticket_type || 'standard';
      const finalSeatNumber = seatNumber || seat_number;
      const finalSeatRow = seatRow || seat_row;
      const finalSeatSection = seatSection || seat_section;

      // Generate ticket number
      const ticketNumber = await this.generateTicketNumber(finalEventId);

      // Calculate total amount
      const totalAmount = parseFloat(price) + parseFloat(servicefee);

      // Get event info (required)
      const event = await db('events').where('id', finalEventId).first();
      if (!event) {
        throw new Error('Event not found');
      }

      // Get user info if userId provided (optional for guests)
      let user = null;
      if (finalUserId) {
        user = await db('users').where('id', finalUserId).first();
      }

      // Generate digital formats if digital ticket
      let qrCodeData = null;
      let nfcData = null;
      let rfidData = null;
      let barcodeData = null;

      if (ticketFormat === 'digital') {
        if (digitalFormat === 'qr_code' || digitalFormat === 'all') {
          const qr = await this.generateQRCode({
            ticketNumber,
            eventId: finalEventId,
            userId: finalUserId
          });
          qrCodeData = qr.rawData;
        }

        if (digitalFormat === 'nfc' || digitalFormat === 'all') {
          const nfc = await this.generateNFCData({
            ticketNumber,
            eventId: finalEventId,
            userId: finalUserId,
            seatInfo: { seatNumber: finalSeatNumber, seatRow: finalSeatRow, seatSection: finalSeatSection },
            validFrom: event.start_date,
            validUntil: event.end_date
          });
          nfcData = nfc.dataString;
        }

        if (digitalFormat === 'rfid' || digitalFormat === 'all') {
          const rfid = await this.generateRFIDData({
            ticketNumber,
            eventId: finalEventId,
            userId: finalUserId
          });
          rfidData = rfid.compactString;
        }

        if (digitalFormat === 'barcode' || digitalFormat === 'all') {
          const barcode = await this.generateBarcodeData({
            ticketNumber,
            eventId: finalEventId
          });
          barcodeData = barcode.dataString;
        }
      }

      // Create ticket record
      const ticket = await db('tickets').insert({
        id: uuidv4(),
        event_id: finalEventId,
        user_id: finalUserId || null,
        ticket_number: ticketNumber,
        ticket_type: finalTicketType,
        ticket_format: ticketFormat,
        digital_format: ticketFormat === 'digital' ? digitalFormat : null,
        seat_number: finalSeatNumber || null,
        seat_row: finalSeatRow || null,
        seat_section: finalSeatSection || null,
        price: price,
        currency: currency,
        service_fee: servicefee,
        total_amount: totalAmount,
        status: status || 'reserved', // Use provided status or default to 'reserved'
        purchase_date: db.fn.now(),
        valid_until: new Date(event.end_date.getTime() + 24 * 60 * 60 * 1000), // Valid until 1 day after event
        is_transferable: true,
        is_refundable: true,
        qr_code_data: qrCodeData ? JSON.stringify(qrCodeData) : null,
        nfc_data: nfcData,
        rfid_data: rfidData,
        is_active: true,
        metadata: JSON.stringify({
          source: ticketData.source || 'web',
          ipAddress: ticketData.ipAddress,
          userAgent: ticketData.userAgent
        })
      }).returning('*');

      return {
        success: true,
        ticket: ticket[0],
        message: 'Ticket created successfully'
      };
    } catch (error) {
      console.error('Error creating ticket:', error);
      throw error;
    }
  }

  /**
   * Validate ticket for entry
   */
  async validateTicket(ticketNumber, eventId) {
    try {
      const ticket = await db('tickets')
        .where('ticket_number', ticketNumber)
        .where('event_id', eventId)
        .first();

      if (!ticket) {
        return {
          valid: false,
          message: 'Ticket not found'
        };
      }

      // Check status
      if (ticket.status === 'cancelled') {
        return {
          valid: false,
          message: 'Ticket has been cancelled'
        };
      }

      if (ticket.status === 'refunded') {
        return {
          valid: false,
          message: 'Ticket has been refunded'
        };
      }

      if (ticket.status === 'used') {
        return {
          valid: false,
          message: 'Ticket has already been used'
        };
      }

      // Check expiration
      if (new Date(ticket.valid_until) < new Date()) {
        return {
          valid: false,
          message: 'Ticket has expired'
        };
      }

      // Get user info for display
      const user = await db('users').where('id', ticket.user_id).first();
      const event = await db('events').where('id', eventId).first();

      return {
        valid: true,
        ticket: ticket,
        user: {
          name: `${user.first_name} ${user.last_name}`,
          email: user.email
        },
        event: {
          name: event.title,
          date: event.start_date
        }
      };
    } catch (error) {
      console.error('Error validating ticket:', error);
      throw error;
    }
  }

  /**
   * Mark ticket as used
   */
  async markTicketAsUsed(ticketNumber, eventId) {
    try {
      const validation = await this.validateTicket(ticketNumber, eventId);

      if (!validation.valid) {
        return {
          success: false,
          message: validation.message
        };
      }

      await db('tickets')
        .where('ticket_number', ticketNumber)
        .where('event_id', eventId)
        .update({
          status: 'used',
          updated_at: db.fn.now()
        });

      return {
        success: true,
        message: 'Ticket marked as used',
        user: validation.user
      };
    } catch (error) {
      console.error('Error marking ticket as used:', error);
      throw error;
    }
  }

  /**
   * Transfer ticket to another user
   */
  async transferTicket(ticketId, fromUserId, toEmail) {
    try {
      const ticket = await db('tickets').where('id', ticketId).first();

      if (!ticket) {
        throw new Error('Ticket not found');
      }

      if (ticket.user_id !== fromUserId) {
        throw new Error('Unauthorized to transfer this ticket');
      }

      if (!ticket.is_transferable) {
        throw new Error('This ticket cannot be transferred');
      }

      // Find recipient user
      const recipient = await db('users').where('email', toEmail).first();

      if (!recipient) {
        throw new Error('Recipient user not found');
      }

      // Update ticket
      await db('tickets').where('id', ticketId).update({
        user_id: recipient.id,
        transferred_from: fromUserId,
        transferred_at: db.fn.now(),
        updated_at: db.fn.now()
      });

      return {
        success: true,
        message: 'Ticket transferred successfully',
        newOwner: recipient.email
      };
    } catch (error) {
      console.error('Error transferring ticket:', error);
      throw error;
    }
  }

  /**
   * Request refund for ticket
   */
  async requestTicketRefund(ticketId, userId, reason) {
    try {
      const ticket = await db('tickets').where('id', ticketId).first();

      if (!ticket) {
        throw new Error('Ticket not found');
      }

      if (ticket.user_id !== userId) {
        throw new Error('Unauthorized to refund this ticket');
      }

      if (!ticket.is_refundable) {
        throw new Error('This ticket cannot be refunded');
      }

      if (ticket.status === 'used') {
        throw new Error('Cannot refund used tickets');
      }

      // Update ticket
      await db('tickets').where('id', ticketId).update({
        status: 'refund_requested',
        refund_requested_at: db.fn.now(),
        refund_reason: reason,
        updated_at: db.fn.now()
      });

      return {
        success: true,
        message: 'Refund request submitted',
        ticketId: ticketId
      };
    } catch (error) {
      console.error('Error requesting refund:', error);
      throw error;
    }
  }

  /**
   * Get user tickets
   */
  async getUserTickets(userId, filters = {}) {
    try {
      let query = db('tickets')
        .where('user_id', userId)
        .whereNull('deleted_at');

      if (filters.eventId) {
        query = query.where('event_id', filters.eventId);
      }

      if (filters.status) {
        if (Array.isArray(filters.status)) {
          query = query.whereIn('status', filters.status);
        } else {
          query = query.where('status', filters.status);
        }
      }

      if (filters.ticketType) {
        query = query.where('ticket_type', filters.ticketType);
      }

      const tickets = await query
        .orderBy('purchase_date', 'desc')
        .limit(filters.limit || 100);

      return tickets;
    } catch (error) {
      console.error('Error fetching user tickets:', error);
      throw error;
    }
  }

  /**
   * Helper: Encrypt sensitive data
   */
  encryptData(data) {
    try {
      const cipher = crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY || 'default-key');
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return encrypted;
    } catch (error) {
      console.error('Encryption error:', error);
      return data; // Return unencrypted as fallback
    }
  }

  /**
   * Helper: Decrypt sensitive data
   */
  decryptData(encryptedData) {
    try {
      const decipher = crypto.createDecipher('aes-256-cbc', process.env.ENCRYPTION_KEY || 'default-key');
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      return null;
    }
  }

  /**
   * Helper: Generate checksum for barcode
   */
  generateChecksum(data) {
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    return hash.substring(0, 4).toUpperCase();
  }

  /**
   * Helper: Format NFC data string
   */
  formatNFCDataString(nfcData) {
    return `NFC|${nfcData.ticketNumber}|${nfcData.eventId}|${nfcData.userId}|${nfcData.timestamp}`;
  }
}

module.exports = new TicketService();
