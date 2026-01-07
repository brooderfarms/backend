const nodemailer = require('nodemailer');
const db = require('../config/database');

class VirtualEventReminder {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  /**
   * Send reminder emails for upcoming virtual events
   * Automatically triggered based on reminder_hours_before setting
   */
  async sendUpcomingEventReminders() {
    try {
      const now = new Date();
      const reminderCheckTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // Check 2 hours ahead

      // Find events that need reminders
      const eventsNeedingReminders = await db('events')
        .where('event_mode', 'in', ['virtual', 'hybrid'])
        .where('sends_reminder_email', true)
        .where('start_date', '<=', reminderCheckTime)
        .where('start_date', '>', now)
        .select('id', 'title', 'start_date', 'meeting_link', 'meeting_id', 'host_name', 'reminder_hours_before');

      for (const event of eventsNeedingReminders) {
        await this.sendEventReminder(event);
      }

      console.log(`Sent reminders for ${eventsNeedingReminders.length} events`);
      return { success: true, remindersSent: eventsNeedingReminders.length };
    } catch (err) {
      console.error('Error sending reminders:', err);
      throw err;
    }
  }

  /**
   * Send reminder for a specific event to all registered attendees
   */
  async sendEventReminder(event) {
    try {
      // Get all registered attendees
      const attendees = await db('tickets')
        .join('users', 'tickets.user_id', '=', 'users.id')
        .where('tickets.event_id', event.id)
        .where('tickets.status', 'completed')
        .select('users.email', 'users.first_name', 'users.last_name');

      if (attendees.length === 0) return;

      const eventTime = new Date(event.start_date).toLocaleString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      });

      for (const attendee of attendees) {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: attendee.email,
          subject: `Reminder: ${event.title} starts soon! 🎥`,
          html: this.generateReminderHTML(event, attendee, eventTime),
        };

        await this.transporter.sendMail(mailOptions);
      }

      console.log(`Sent reminders to ${attendees.length} attendees for event: ${event.title}`);
    } catch (err) {
      console.error(`Error sending reminders for event ${event.id}:`, err);
      throw err;
    }
  }

  /**
   * Send certificate to attendee after event completion
   */
  async sendCertificate(ticketId) {
    try {
      const ticket = await db('tickets')
        .join('users', 'tickets.user_id', '=', 'users.id')
        .join('events', 'tickets.event_id', '=', 'events.id')
        .where('tickets.id', ticketId)
        .select(
          'users.email',
          'users.first_name',
          'users.last_name',
          'events.title',
          'events.certificate_template_url',
          'events.certificate_text',
          'events.issuing_organization',
          'tickets.completion_percentage'
        )
        .first();

      if (!ticket || !ticket.certificate_template_url) return;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: ticket.email,
        subject: `Congratulations! Your Certificate of Completion for ${ticket.title} 🎓`,
        html: this.generateCertificateHTML(ticket),
        attachments: [
          {
            filename: 'certificate.pdf',
            url: ticket.certificate_template_url,
          },
        ],
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Certificate sent to ${ticket.email}`);
    } catch (err) {
      console.error(`Error sending certificate for ticket ${ticketId}:`, err);
      throw err;
    }
  }

  /**
   * Send post-event follow-up email with recording and feedback
   */
  async sendPostEventFollowUp(eventId) {
    try {
      const event = await db('events')
        .where('id', eventId)
        .select('title', 'recording_url', 'recording_available_after_event', 'host_name')
        .first();

      if (!event || !event.recording_available_after_event) return;

      const attendees = await db('tickets')
        .join('users', 'tickets.user_id', '=', 'users.id')
        .where('tickets.event_id', eventId)
        .where('tickets.status', 'completed')
        .select('users.email', 'users.first_name');

      for (const attendee of attendees) {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: attendee.email,
          subject: `Thank you for attending ${event.title}! Recording available 📹`,
          html: this.generatePostEventHTML(event, attendee),
        };

        await this.transporter.sendMail(mailOptions);
      }

      console.log(`Post-event emails sent to ${attendees.length} attendees`);
    } catch (err) {
      console.error(`Error sending post-event emails for event ${eventId}:`, err);
      throw err;
    }
  }

  /**
   * Send host summary after event with analytics
   */
  async sendHostSummary(eventId) {
    try {
      const event = await db('events')
        .where('id', eventId)
        .select('id', 'title', 'host_email', 'start_date')
        .first();

      if (!event || !event.host_email) return;

      // Get event analytics
      const stats = await db('tickets')
        .where('event_id', eventId)
        .where('status', 'completed')
        .select(
          db.raw('COUNT(*) as total_attendees'),
          db.raw('AVG(completion_percentage) as avg_completion'),
          db.raw('AVG(session_duration) as avg_duration'),
          db.raw('SUM(CASE WHEN chat_messages_count > 0 THEN 1 ELSE 0 END) as engaged_chat'),
          db.raw('AVG(rating) as avg_rating')
        )
        .first();

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: event.host_email,
        subject: `Event Summary: ${event.title} - Post-Event Analytics 📊`,
        html: this.generateHostSummaryHTML(event, stats),
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Host summary sent to ${event.host_email}`);
    } catch (err) {
      console.error(`Error sending host summary for event ${eventId}:`, err);
      throw err;
    }
  }

  /**
   * Generate reminder email HTML
   */
  generateReminderHTML(event, attendee, eventTime) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .event-details { background: white; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0; border-radius: 4px; }
            .button { background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 10px 0; }
            .footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎥 Event Reminder!</h1>
              <p>Your virtual event is starting soon</p>
            </div>
            <div class="content">
              <p>Hi ${attendee.first_name},</p>
              
              <p>This is a reminder that <strong>${event.title}</strong> is starting soon!</p>
              
              <div class="event-details">
                <h3>📍 Event Details</h3>
                <p><strong>Event:</strong> ${event.title}</p>
                <p><strong>Host:</strong> ${event.host_name || 'TBA'}</p>
                <p><strong>Start Time:</strong> ${eventTime} (UTC)</p>
                ${event.meeting_id ? `<p><strong>Meeting ID:</strong> ${event.meeting_id}</p>` : ''}
              </div>

              <h3>How to Join:</h3>
              ${event.meeting_link ? `
                <p>Click the button below to join the meeting:</p>
                <a href="${event.meeting_link}" class="button">Join Virtual Event</a>
                <p>Or copy this link: ${event.meeting_link}</p>
              ` : `
                <p>The meeting link will be sent to you shortly. Keep an eye on your email!</p>
              `}

              <h3>Tips:</h3>
              <ul>
                <li>Join 5 minutes early to test your audio and video</li>
                <li>Ensure you have a stable internet connection</li>
                <li>Find a quiet environment for the best experience</li>
                <li>Have your camera and microphone ready</li>
              </ul>

              <p>If you have any questions, feel free to reach out to the organizer.</p>
              
              <p>See you soon! 👋</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Ticketing Platform. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate certificate email HTML
   */
  generateCertificateHTML(ticket) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .certificate-info { background: white; padding: 20px; border: 2px dashed #ffc107; margin: 20px 0; border-radius: 4px; }
            .button { background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 10px 0; }
            .footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎓 Certificate of Completion</h1>
              <p>Congratulations on completing the event!</p>
            </div>
            <div class="content">
              <p>Hi ${ticket.first_name} ${ticket.last_name},</p>
              
              <p>Congratulations! You have successfully completed <strong>${ticket.title}</strong>.</p>
              
              <div class="certificate-info">
                <h3>Certificate Details</h3>
                <p><strong>Event:</strong> ${ticket.title}</p>
                <p><strong>Completion Rate:</strong> ${ticket.completion_percentage}%</p>
                <p><strong>Issued By:</strong> ${ticket.issuing_organization || 'Ticketing Platform'}</p>
                ${ticket.certificate_text ? `<p><strong>Notes:</strong> ${ticket.certificate_text}</p>` : ''}
              </div>

              <p>Your certificate has been generated and is attached to this email. You can download it and add it to your credentials.</p>

              <a href="#" class="button">Download Certificate</a>

              <p>Thank you for attending! We hope you found the event valuable.</p>
              
              <p>Best regards,<br>The Ticketing Team 👋</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Ticketing Platform. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate post-event email HTML
   */
  generatePostEventHTML(event, attendee) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .info-box { background: white; padding: 20px; margin: 20px 0; border-radius: 4px; border-left: 4px solid #667eea; }
            .button { background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 10px 0; }
            .footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Thank You! 🙏</h1>
              <p>Thank you for attending ${event.title}</p>
            </div>
            <div class="content">
              <p>Hi ${attendee.first_name},</p>
              
              <p>Thank you for attending <strong>${event.title}</strong> with us! We hope you had a great experience.</p>
              
              ${event.recording_url ? `
                <div class="info-box">
                  <h3>📹 Recording Available</h3>
                  <p>You can now watch the event recording at your convenience.</p>
                  <a href="${event.recording_url}" class="button">Watch Recording</a>
                </div>
              ` : ''}

              <div class="info-box">
                <h3>📝 Share Your Feedback</h3>
                <p>Your feedback helps us improve future events. Please take a moment to rate and review the event.</p>
                <a href="#" class="button">Leave Review</a>
              </div>

              <h3>What's Next?</h3>
              <ul>
                <li>Check your email for the certificate of completion</li>
                <li>Download the event resources from your account</li>
                <li>Connect with other attendees on the community forum</li>
                <li>Sign up for upcoming events by the same host</li>
              </ul>

              <p>If you have any questions or feedback, feel free to reach out to us.</p>
              
              <p>Best regards,<br>The ${event.host_name || 'Ticketing Platform'} Team 👋</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Ticketing Platform. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate host summary email HTML
   */
  generateHostSummaryHTML(event, stats) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .stat-box { background: white; padding: 15px; margin: 10px 0; border-radius: 4px; display: inline-block; width: 45%; margin-right: 5%; }
            .button { background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 10px 0; }
            .footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📊 Event Summary</h1>
              <p>Your event analytics and insights</p>
            </div>
            <div class="content">
              <p>Hello,</p>
              
              <p>Thank you for hosting <strong>${event.title}</strong>. Here's a summary of your event:</p>
              
              <h3>Event Analytics</h3>
              <div class="stat-box">
                <strong>Total Attendees</strong>
                <h2 style="color: #667eea; margin: 10px 0;">${stats.total_attendees}</h2>
              </div>
              <div class="stat-box">
                <strong>Avg Completion</strong>
                <h2 style="color: #667eea; margin: 10px 0;">${Math.round(stats.avg_completion)}%</h2>
              </div>
              <div style="clear: both;"></div>
              
              <div class="stat-box">
                <strong>Avg Duration</strong>
                <h2 style="color: #667eea; margin: 10px 0;">${Math.round(stats.avg_duration)} min</h2>
              </div>
              <div class="stat-box">
                <strong>Engagement</strong>
                <h2 style="color: #667eea; margin: 10px 0;">${stats.engaged_chat} chats</h2>
              </div>
              <div style="clear: both;"></div>

              ${stats.avg_rating ? `
                <div class="stat-box" style="width: 100%;">
                  <strong>Average Rating</strong>
                  <h2 style="color: #667eea; margin: 10px 0;">${stats.avg_rating.toFixed(1)} ⭐</h2>
                </div>
              ` : ''}

              <h3>Next Steps</h3>
              <ul>
                <li>Review attendee feedback and comments</li>
                <li>Send thank you emails to attendees</li>
                <li>Share the event recording with attendees</li>
                <li>Generate certificates for qualified attendees</li>
              </ul>

              <a href="#" class="button">View Full Analytics</a>

              <p>Thank you for using our platform!</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Ticketing Platform. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}

module.exports = new VirtualEventReminder();
