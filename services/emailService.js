const nodemailer = require('nodemailer');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Configure mail transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

class EmailService {
  /**
   * Send verification email
   */
  async sendVerificationEmail(user, verificationToken) {
    try {
      const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

      const html = this.getVerificationEmailTemplate(user.first_name, verificationLink);

      await this.sendEmail({
        to: user.email,
        subject: 'Verify Your Email - TicketPro',
        html: html
      });

      return {
        success: true,
        message: 'Verification email sent'
      };
    } catch (error) {
      console.error('Error sending verification email:', error);
      throw error;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(user, resetToken) {
    try {
      const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

      const html = this.getPasswordResetEmailTemplate(user.first_name, resetLink);

      await this.sendEmail({
        to: user.email,
        subject: 'Password Reset Request - TicketPro',
        html: html
      });

      return {
        success: true,
        message: 'Password reset email sent'
      };
    } catch (error) {
      console.error('Error sending password reset email:', error);
      throw error;
    }
  }

  /**
   * Send purchase confirmation email with ticket details
   */
  async sendPurchaseConfirmationEmail(user, payment, tickets, event) {
    try {
      const html = this.getPurchaseConfirmationTemplate(user, payment, tickets, event);

      const attachments = [];
      
      // Add invoices or receipt PDFs if available
      if (payment.invoice_url) {
        attachments.push({
          filename: `invoice-${payment.id}.pdf`,
          path: payment.invoice_url
        });
      }

      await this.sendEmail({
        to: user.email,
        subject: `Purchase Confirmation - ${event.title} #${payment.id.substring(0, 8)}`,
        html: html,
        attachments: attachments
      });

      return {
        success: true,
        message: 'Purchase confirmation email sent'
      };
    } catch (error) {
      console.error('Error sending purchase confirmation:', error);
      throw error;
    }
  }

  /**
   * Send abandoned cart reminder email
   */
  async sendCartReminderEmail(user, cartItems, cartTotal) {
    try {
      const html = this.getCartReminderTemplate(user.first_name, cartItems, cartTotal);
      
      // Create checkout link
      const checkoutLink = `${process.env.FRONTEND_URL}/checkout?continue=true`;

      const htmlWithLink = html.replace('{{CHECKOUT_LINK}}', checkoutLink);

      await this.sendEmail({
        to: user.email,
        subject: 'Don\'t Forget Your Tickets! Complete Your Purchase',
        html: htmlWithLink
      });

      // Log the reminder in database
      if (user.id) {
        try {
          await db('cart_reminders').insert({
            id: uuidv4(),
            user_id: user.id,
            items_count: cartItems.length,
            total_amount: cartTotal,
            sent_at: new Date(),
            status: 'sent'
          });
        } catch (dbError) {
          console.warn('Could not log cart reminder:', dbError);
        }
      }

      return {
        success: true,
        message: 'Cart reminder email sent'
      };
    } catch (error) {
      console.error('Error sending cart reminder:', error);
      throw error;
    }
  }

  /**
   * Send digital ticket email
   */
  async sendDigitalTicket(user, ticket, event, ticketData) {
    try {
      const { qrCode, nfcData, rfidData, barcodeData } = ticketData;

      let html = this.getTicketEmailTemplate(user.first_name, event.title, ticket);

      // Include QR code if available
      if (qrCode) {
        html = html.replace('{{QR_CODE_PLACEHOLDER}}', `<img src="cid:qrcode" alt="QR Code" />`);
      }

      // Prepare attachments
      const attachments = [];
      if (qrCode) {
        attachments.push({
          filename: 'ticket-qr.png',
          content: qrCode,
          cid: 'qrcode'
        });
      }

      await this.sendEmail({
        to: user.email,
        subject: `Your Ticket Confirmation - ${event.title}`,
        html: html,
        attachments: attachments
      });

      // Update ticket email_sent flag
      await db('tickets').where('id', ticket.id).update({
        email_sent: true,
        email_sent_at: db.fn.now()
      });

      return {
        success: true,
        message: 'Ticket email sent successfully'
      };
    } catch (error) {
      console.error('Error sending digital ticket:', error);
      throw error;
    }
  }

  /**
   * Send ticket transfer notification
   */
  async sendTicketTransferEmail(fromUser, toUser, ticket, event) {
    try {
      const html = this.getTicketTransferEmailTemplate(
        toUser.first_name,
        fromUser.first_name,
        event.title,
        ticket
      );

      await this.sendEmail({
        to: toUser.email,
        subject: `You've Received a Ticket - ${event.title}`,
        html: html
      });

      return {
        success: true,
        message: 'Transfer notification sent'
      };
    } catch (error) {
      console.error('Error sending ticket transfer email:', error);
      throw error;
    }
  }

  /**
   * Send refund notification
   */
  async sendRefundEmail(user, payment, reason) {
    try {
      const refundAmount = payment.refunded_amount || payment.amount;
      const html = this.getRefundEmailTemplate(user.first_name, refundAmount, reason);

      await this.sendEmail({
        to: user.email,
        subject: 'Refund Processed - TicketPro',
        html: html
      });

      return {
        success: true,
        message: 'Refund notification sent'
      };
    } catch (error) {
      console.error('Error sending refund email:', error);
      throw error;
    }
  }

  /**
   * Send event cancellation email
   */
  async sendEventCancellationEmail(user, event, refundInfo) {
    try {
      const html = this.getEventCancellationEmailTemplate(user.first_name, event.title, refundInfo);

      await this.sendEmail({
        to: user.email,
        subject: `Event Cancelled - ${event.title}`,
        html: html
      });

      return {
        success: true,
        message: 'Cancellation email sent'
      };
    } catch (error) {
      console.error('Error sending event cancellation email:', error);
      throw error;
    }
  }

  /**
   * Send booking confirmation email
   */
  async sendBookingConfirmationEmail(user, orderSummary) {
    try {
      const html = this.getBookingConfirmationTemplate(user.first_name, orderSummary);

      await this.sendEmail({
        to: user.email,
        subject: `Order Confirmation #${orderSummary.orderId}`,
        html: html
      });

      return {
        success: true,
        message: 'Booking confirmation sent'
      };
    } catch (error) {
      console.error('Error sending booking confirmation:', error);
      throw error;
    }
  }

  /**
   * Send fraud alert email
   */
  async sendFraudAlertEmail(user, transactionDetails) {
    try {
      const html = this.getFraudAlertEmailTemplate(user.first_name, transactionDetails);

      await this.sendEmail({
        to: user.email,
        subject: 'Unusual Activity Detected - Action Required',
        html: html
      });

      return {
        success: true,
        message: 'Fraud alert sent'
      };
    } catch (error) {
      console.error('Error sending fraud alert:', error);
      throw error;
    }
  }

  /**
   * Send admin notification
   */
  async sendAdminNotification(adminEmail, subject, message, data = {}) {
    try {
      const html = this.getAdminNotificationTemplate(subject, message, data);

      await this.sendEmail({
        to: adminEmail,
        subject: `[ADMIN] ${subject}`,
        html: html
      });

      return {
        success: true,
        message: 'Admin notification sent'
      };
    } catch (error) {
      console.error('Error sending admin notification:', error);
      throw error;
    }
  }

  /**
   * Core email sending function
   */
  async sendEmail(emailOptions) {
    try {
      const mailOptions = {
        from: process.env.SMTP_FROM_EMAIL || 'noreply@ticketpro.com',
        to: emailOptions.to,
        subject: emailOptions.subject,
        html: emailOptions.html,
        attachments: emailOptions.attachments || []
      };

      const info = await transporter.sendMail(mailOptions);

      // Log email sending
      await db('audit_logs').insert({
        id: uuidv4(),
        action: 'EMAIL_SENT',
        resource: 'emails',
        metadata: JSON.stringify({
          to: emailOptions.to,
          subject: emailOptions.subject,
          messageId: info.messageId
        }),
        timestamp: db.fn.now()
      }).catch(err => console.error('Error logging email:', err));

      return {
        success: true,
        messageId: info.messageId
      };
    } catch (error) {
      console.error('Email sending error:', error);
      throw error;
    }
  }

  /**
   * EMAIL TEMPLATES
   */

  getVerificationEmailTemplate(firstName, verificationLink) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f5f5f5; }
            .button { display: inline-block; background-color: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
            .footer { text-align: center; padding: 10px; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to TicketPro</h1>
            </div>
            <div class="content">
              <p>Hi ${firstName},</p>
              <p>Thank you for creating a TicketPro account! To complete your registration, please verify your email address by clicking the button below:</p>
              <a href="${verificationLink}" class="button">Verify Email</a>
              <p>If you didn't create this account, you can safely ignore this email.</p>
              <p>This link will expire in 24 hours.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 TicketPro. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  getPasswordResetEmailTemplate(firstName, resetLink) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background-color: #FF9800; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f5f5f5; }
            .button { display: inline-block; background-color: #FF9800; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
            .footer { text-align: center; padding: 10px; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hi ${firstName},</p>
              <p>We received a request to reset your password. Click the button below to create a new password:</p>
              <a href="${resetLink}" class="button">Reset Password</a>
              <p>If you didn't request a password reset, you can safely ignore this email.</p>
              <p>This link will expire in 1 hour.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 TicketPro. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  getTicketEmailTemplate(firstName, eventTitle, ticket) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f5f5f5; }
            .ticket-info { background-color: white; padding: 20px; border-radius: 4px; margin: 20px 0; }
            .qr-code { text-align: center; margin: 20px 0; }
            .footer { text-align: center; padding: 10px; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Your Ticket Confirmation</h1>
            </div>
            <div class="content">
              <p>Hi ${firstName},</p>
              <p>Your ticket for <strong>${eventTitle}</strong> is confirmed!</p>
              
              <div class="ticket-info">
                <h3>Ticket Details</h3>
                <p><strong>Ticket Number:</strong> ${ticket.ticket_number}</p>
                <p><strong>Type:</strong> ${ticket.ticket_type}</p>
                <p><strong>Format:</strong> ${ticket.ticket_format}</p>
                ${ticket.seat_number ? `<p><strong>Seat:</strong> ${ticket.seat_row}${ticket.seat_number}</p>` : ''}
                <p><strong>Price:</strong> ${ticket.currency} ${ticket.total_amount}</p>
              </div>

              <div class="qr-code">
                <h3>Scan to Verify</h3>
                {{QR_CODE_PLACEHOLDER}}
              </div>

              <p>Save this email or take a screenshot of the QR code. You'll need it to enter the event.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 TicketPro. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  getTicketTransferEmailTemplate(firstName, fromUserName, eventTitle, ticket) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background-color: #9C27B0; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f5f5f5; }
            .footer { text-align: center; padding: 10px; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Ticket Transfer Received</h1>
            </div>
            <div class="content">
              <p>Hi ${firstName},</p>
              <p><strong>${fromUserName}</strong> has transferred a ticket to you for <strong>${eventTitle}</strong>!</p>
              <p><strong>Ticket Number:</strong> ${ticket.ticket_number}</p>
              <p>Log into your TicketPro account to view and manage this ticket.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 TicketPro. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  getRefundEmailTemplate(firstName, refundAmount, reason) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f5f5f5; }
            .footer { text-align: center; padding: 10px; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Refund Processed</h1>
            </div>
            <div class="content">
              <p>Hi ${firstName},</p>
              <p>Your refund has been processed successfully.</p>
              <p><strong>Refund Amount:</strong> ${refundAmount}</p>
              <p><strong>Reason:</strong> ${reason}</p>
              <p>The funds should appear in your original payment method within 3-5 business days.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 TicketPro. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  getEventCancellationEmailTemplate(firstName, eventTitle, refundInfo) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background-color: #F44336; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f5f5f5; }
            .footer { text-align: center; padding: 10px; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Event Cancelled</h1>
            </div>
            <div class="content">
              <p>Hi ${firstName},</p>
              <p>Unfortunately, <strong>${eventTitle}</strong> has been cancelled.</p>
              <p><strong>Refund Amount:</strong> ${refundInfo.amount}</p>
              <p>A full refund has been processed to your original payment method.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 TicketPro. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  getBookingConfirmationTemplate(firstName, orderSummary) {
    const itemsHtml = orderSummary.items
      .map(item => `<li>${item.name} - ${item.quantity}x ${item.price}</li>`)
      .join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f5f5f5; }
            .footer { text-align: center; padding: 10px; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Order Confirmation</h1>
            </div>
            <div class="content">
              <p>Hi ${firstName},</p>
              <p>Thank you for your order! Order ID: <strong>${orderSummary.orderId}</strong></p>
              <ul>${itemsHtml}</ul>
              <p><strong>Total: ${orderSummary.total}</strong></p>
            </div>
            <div class="footer">
              <p>&copy; 2026 TicketPro. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  getFraudAlertEmailTemplate(firstName, transactionDetails) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background-color: #F44336; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f5f5f5; }
            .button { display: inline-block; background-color: #F44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; }
            .footer { text-align: center; padding: 10px; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Unusual Activity Alert</h1>
            </div>
            <div class="content">
              <p>Hi ${firstName},</p>
              <p>We detected unusual activity on your account that might indicate fraud.</p>
              <p><strong>Amount:</strong> ${transactionDetails.amount}</p>
              <p><strong>Time:</strong> ${transactionDetails.timestamp}</p>
              <p>If this wasn't you, please contact support immediately.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 TicketPro. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  getAdminNotificationTemplate(subject, message, data) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background-color: #333; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f5f5f5; }
            .footer { text-align: center; padding: 10px; font-size: 12px; color: #999; }
            code { background-color: #ddd; padding: 5px; border-radius: 3px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${subject}</h1>
            </div>
            <div class="content">
              <p>${message}</p>
              ${Object.entries(data).length > 0 ? `
                <h3>Details:</h3>
                <pre>${JSON.stringify(data, null, 2)}</pre>
              ` : ''}
            </div>
            <div class="footer">
              <p>&copy; 2026 TicketPro. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  getPurchaseConfirmationTemplate(user, payment, tickets, event) {
    const ticketList = tickets.map(ticket => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${ticket.ticket_type || 'Standard'}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">$${(ticket.price || 0).toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${ticket.quantity || 1}</td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f5f5f5; }
            .section { background-color: white; padding: 15px; margin: 15px 0; border-radius: 4px; }
            .table { width: 100%; border-collapse: collapse; }
            .table th { background-color: #f0f0f0; padding: 10px; text-align: left; font-weight: bold; }
            .button { display: inline-block; background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 15px 0; }
            .footer { text-align: center; padding: 10px; font-size: 12px; color: #999; }
            .amount { font-size: 18px; font-weight: bold; color: #2196F3; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Purchase Confirmation</h1>
            </div>
            <div class="content">
              <p>Hi ${user.first_name},</p>
              <p>Thank you for your purchase! Your order has been confirmed.</p>

              <div class="section">
                <h3>Order Details</h3>
                <p><strong>Order ID:</strong> ${payment.id.substring(0, 8)}</p>
                <p><strong>Event:</strong> ${event.title}</p>
                <p><strong>Date:</strong> ${new Date(event.start_date).toLocaleDateString()}</p>
                <p><strong>Order Date:</strong> ${new Date(payment.created_at).toLocaleDateString()}</p>
              </div>

              <div class="section">
                <h3>Tickets</h3>
                <table class="table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Price</th>
                      <th>Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${ticketList}
                  </tbody>
                </table>
              </div>

              <div class="section">
                <p><strong>Total Amount:</strong> <span class="amount">$${(payment.amount || 0).toFixed(2)}</span></p>
                <p><strong>Payment Status:</strong> ${payment.status.toUpperCase()}</p>
              </div>

              <div class="section">
                <p>Your digital tickets are attached to this email. You can also download them from your account.</p>
                <a href="${process.env.FRONTEND_URL}/my-tickets" class="button">View All Tickets</a>
              </div>

              <div class="section">
                <h3>What's Next?</h3>
                <ul>
                  <li>Add tickets to your wallet or digital pass</li>
                  <li>Share with friends or family</li>
                  <li>Check the event details on our website</li>
                </ul>
              </div>

              <p>If you have any questions, please contact our support team.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 TicketPro. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  getCartReminderTemplate(firstName, cartItems, cartTotal) {
    const itemsList = cartItems.map(item => `
      <li style="padding: 8px 0;">
        <strong>${item.event_title || 'Event'}</strong> - 
        ${item.quantity || 1} ticket(s) @ $${(item.price || 0).toFixed(2)} each
      </li>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background-color: #FF9800; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f5f5f5; }
            .section { background-color: white; padding: 15px; margin: 15px 0; border-radius: 4px; }
            .button { display: inline-block; background-color: #FF9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 15px 0; }
            .footer { text-align: center; padding: 10px; font-size: 12px; color: #999; }
            .warning { background-color: #fff3cd; padding: 10px; border-left: 4px solid #FF9800; margin: 15px 0; }
            .total { font-size: 18px; font-weight: bold; color: #FF9800; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Don't Forget Your Tickets!</h1>
            </div>
            <div class="content">
              <p>Hi ${firstName},</p>
              <p>You have items in your cart that you haven't purchased yet. Complete your order before they're gone!</p>

              <div class="section">
                <h3>Items in Your Cart:</h3>
                <ul style="padding-left: 20px;">
                  ${itemsList}
                </ul>
              </div>

              <div class="section">
                <p><strong>Cart Total:</strong> <span class="total">$${(cartTotal || 0).toFixed(2)}</span></p>
              </div>

              <div class="warning">
                <strong>⏰ Act Fast!</strong> Tickets sell quickly and this offer may expire. Complete your purchase now to secure your spot.
              </div>

              <a href="{{CHECKOUT_LINK}}" class="button">Complete Your Purchase</a>

              <div class="section">
                <p>Questions? Our support team is here to help!</p>
              </div>
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

module.exports = EmailService;