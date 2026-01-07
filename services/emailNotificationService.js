const db = require('../config/database');
const emailService = require('./emailService');
const { v4: uuidv4 } = require('uuid');

/**
 * EmailNotificationService - Handles all email notifications for ticketing system
 * - Purchase confirmations with digital tickets
 * - Cart abandonment reminders
 * - Event reminders and updates
 */
class EmailNotificationService {
  /**
   * Send purchase confirmation email with tickets
   * Called when payment is successful
   */
  async sendPurchaseConfirmation(paymentId) {
    try {
      // Fetch payment details with related data
      const payment = await db('payments')
        .where('id', paymentId)
        .first();

      if (!payment) {
        throw new Error('Payment not found');
      }

      // Fetch user details
      const user = await db('users')
        .where('id', payment.user_id)
        .first();

      if (!user) {
        throw new Error('User not found');
      }

      // Fetch tickets for this payment
      const tickets = await db('tickets')
        .where('payment_id', paymentId)
        .leftJoin('events', 'tickets.event_id', 'events.id')
        .select('tickets.*', 'events.title as event_title', 'events.start_date');

      if (tickets.length === 0) {
        console.warn('No tickets found for payment:', paymentId);
      }

      // Get the main event for this payment
      const event = await db('events')
        .where('id', tickets[0].event_id)
        .first();

      // Send purchase confirmation
      await emailService.sendPurchaseConfirmationEmail(user, payment, tickets, event);

      // Send digital tickets for each ticket
      for (const ticket of tickets) {
        try {
          // Generate QR code for the ticket (if not already generated)
          const ticketQR = ticket.qr_code || await this.generateTicketQR(ticket.id);

          await emailService.sendDigitalTicket(user, ticket, event, {
            qrCode: ticketQR,
            nfcData: ticket.nfc_data,
            rfidData: ticket.rfid_data,
            barcodeData: ticket.barcode_data
          });
        } catch (ticketError) {
          console.error('Error sending individual ticket for:', ticket.id, ticketError);
        }
      }

      return {
        success: true,
        message: 'Purchase confirmation and tickets sent successfully'
      };
    } catch (error) {
      console.error('Error sending purchase confirmation:', error);
      throw error;
    }
  }

  /**
   * Generate a QR code for a ticket
   * This would integrate with QR code generation library
   */
  async generateTicketQR(ticketId) {
    try {
      // This is a placeholder - integrate with actual QR code generation library
      // Example: import QRCode from 'qrcode';
      // const qrCodeImage = await QRCode.toDataURL(ticketId);
      
      console.log('Generating QR code for ticket:', ticketId);
      
      // For now, return null - update with actual implementation
      return null;
    } catch (error) {
      console.error('Error generating QR code:', error);
      return null;
    }
  }

  /**
   * Send cart reminder emails to users with abandoned carts
   * Should be run periodically (via cron job or scheduled task)
   * @param hoursThreshold - hours before sending reminder (default: 4)
   */
  async sendAbandonedCartReminders(hoursThreshold = 4) {
    try {
      // Find carts not updated in the last X hours
      const threshold = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);

      // Query carts that haven't been updated and have items
      const abandonedCarts = await db('shopping_carts')
        .where('updated_at', '<', threshold)
        .where('status', 'active')
        .select('*');

      let reminders_sent = 0;

      for (const cart of abandonedCarts) {
        try {
          // Fetch cart items
          const cartItems = await db('cart_items')
            .where('cart_id', cart.id)
            .leftJoin('events', 'cart_items.event_id', 'events.id')
            .select('cart_items.*', 'events.title as event_title', 'events.start_date');

          if (cartItems.length === 0) {
            continue;
          }

          // Fetch user
          const user = await db('users')
            .where('id', cart.user_id)
            .first();

          if (!user) {
            continue;
          }

          // Calculate cart total
          const cartTotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

          // Check if reminder already sent recently
          const recentReminder = await db('cart_reminders')
            .where('user_id', user.id)
            .where('sent_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
            .first();

          if (recentReminder) {
            // Skip if reminder already sent in last 24 hours
            continue;
          }

          // Send reminder
          await emailService.sendCartReminderEmail(user, cartItems, cartTotal);
          
          reminders_sent++;

          // Optional: Mark cart as having reminder sent
          // await db('shopping_carts').where('id', cart.id).update({
          //   reminder_sent_at: new Date()
          // });

        } catch (cartError) {
          console.error('Error processing cart:', cart.id, cartError);
        }
      }

      console.log(`Sent ${reminders_sent} abandoned cart reminders`);
      
      return {
        success: true,
        reminders_sent: reminders_sent
      };
    } catch (error) {
      console.error('Error sending abandoned cart reminders:', error);
      throw error;
    }
  }

  /**
   * Send event reminder email to ticket holders before the event
   * @param eventId - event ID
   * @param hoursBefore - hours before event to send reminder (default: 24)
   */
  async sendEventReminderEmails(eventId, hoursBefore = 24) {
    try {
      const event = await db('events')
        .where('id', eventId)
        .first();

      if (!event) {
        throw new Error('Event not found');
      }

      // Calculate if event is within the reminder window
      const now = new Date();
      const eventTime = new Date(event.start_date);
      const hoursDiff = (eventTime - now) / (1000 * 60 * 60);

      if (hoursDiff < 0 || hoursDiff > hoursBefore) {
        // Event is not within reminder window
        return { success: true, reminders_sent: 0 };
      }

      // Fetch all ticket holders for this event
      const tickets = await db('tickets')
        .where('event_id', eventId)
        .where('status', 'valid')
        .leftJoin('users', 'tickets.user_id', 'users.id')
        .select('tickets.*', 'users.id as user_id', 'users.first_name', 'users.email');

      let reminders_sent = 0;

      for (const ticket of tickets) {
        try {
          // Check if reminder already sent
          const existingReminder = await db('email_logs')
            .where('user_id', ticket.user_id)
            .where('type', 'event_reminder')
            .where('event_id', eventId)
            .where('created_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
            .first();

          if (existingReminder) {
            continue; // Skip if reminder already sent
          }

          // Send event reminder email
          const html = this.getEventReminderTemplate(ticket.first_name, event);

          await emailService.sendEmail({
            to: ticket.email,
            subject: `Reminder: ${event.title} - Starting ${event.start_date}`,
            html: html
          });

          reminders_sent++;

          // Log email sent
          await db('email_logs').insert({
            id: uuidv4(),
            user_id: ticket.user_id,
            ticket_id: ticket.id,
            event_id: eventId,
            type: 'event_reminder',
            status: 'sent',
            created_at: new Date()
          });

        } catch (ticketError) {
          console.error('Error sending reminder for ticket:', ticket.id, ticketError);
        }
      }

      console.log(`Sent ${reminders_sent} event reminders for event: ${eventId}`);

      return {
        success: true,
        reminders_sent: reminders_sent
      };
    } catch (error) {
      console.error('Error sending event reminders:', error);
      throw error;
    }
  }

  /**
   * Event reminder email template
   */
  getEventReminderTemplate(firstName, event) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background-color: #9C27B0; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f5f5f5; }
            .section { background-color: white; padding: 15px; margin: 15px 0; border-radius: 4px; }
            .button { display: inline-block; background-color: #9C27B0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 15px 0; }
            .footer { text-align: center; padding: 10px; font-size: 12px; color: #999; }
            .highlight { background-color: #f0f0f0; padding: 10px; border-left: 4px solid #9C27B0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Event Reminder: ${event.title}</h1>
            </div>
            <div class="content">
              <p>Hi ${firstName},</p>
              <p>Get ready! Your event is coming up soon!</p>

              <div class="section highlight">
                <h3>${event.title}</h3>
                <p><strong>Date & Time:</strong> ${new Date(event.start_date).toLocaleString()}</p>
                <p><strong>Location:</strong> ${event.venue_name || 'Check your ticket for details'}</p>
                <p><strong>Doors Open:</strong> Check your ticket for entry time</p>
              </div>

              <div class="section">
                <h3>Quick Reminders:</h3>
                <ul>
                  <li>Bring your ticket (digital or printed)</li>
                  <li>Arrive early to avoid lines</li>
                  <li>Check parking and transportation options</li>
                  <li>Review event policies and what's allowed</li>
                </ul>
              </div>

              <div class="section">
                <p>Questions? Check your ticket details or contact the event organizer.</p>
                <a href="${process.env.FRONTEND_URL}/my-tickets" class="button">View Your Tickets</a>
              </div>

              <p>See you there! Have a great time!</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 TicketPro. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}

module.exports = new EmailNotificationService();
