const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../config/database');
const auditService = require('./auditService');
const ticketService = require('./ticketService');
const EmailService = require('./emailService');

const emailService = new EmailService();

class GuestCheckoutService {
  /**
   * Create guest cart (no auth required)
   */
  async createGuestCart() {
    try {
      const cartId = uuidv4();
      const cart = {
        id: cartId,
        user_id: null,
        is_guest: true,
        status: 'active',
        created_at: new Date(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      };

      const result = await db('shopping_carts').insert(cart);
      console.log('Guest cart created:', { cartId, result });

      return {
        cartId,
        isGuest: true,
        expiresAt: cart.expires_at
      };
    } catch (error) {
      console.error('Create guest cart error:', error);
      throw error;
    }
  }

  /**
   * Get guest cart (by cart ID)
   */
  async getGuestCart(cartId) {
    try {
      const cart = await db('shopping_carts')
        .where('id', cartId)
        .first();

      if (!cart) {
        console.log('Guest cart not found:', { cartId });
        return null;
      }

      // Make sure it's a guest cart
      if (!cart.is_guest) {
        console.log('Cart is not a guest cart:', { cartId, is_guest: cart.is_guest });
        return null;
      }

      const items = await db('shopping_cart_items')
        .where('shopping_cart_items.cart_id', cartId)
        .leftJoin('events', 'shopping_cart_items.event_id', 'events.id')
        .leftJoin('venues', 'events.venue_id', 'venues.id')
        .select([
          'shopping_cart_items.id',
          'shopping_cart_items.event_id',
          'shopping_cart_items.quantity',
          'shopping_cart_items.unit_price',
          'shopping_cart_items.total_price',
          'shopping_cart_items.ticket_type',
          'shopping_cart_items.seat_numbers',
          'events.id as event_id',
          'events.title as event_title',
          'events.start_date as event_date',
          db.raw('COALESCE(venues.name, ?) as venue_name', [''])
        ]);

      const processedItems = items.map(item => ({
        ...item,
        seat_numbers: item.seat_numbers ? 
          (typeof item.seat_numbers === 'string' ? JSON.parse(item.seat_numbers) : item.seat_numbers) : 
          []
      }));

      console.log('Guest cart found with items:', { cartId, itemCount: processedItems.length });

      return {
        ...cart,
        items: processedItems
      };
    } catch (error) {
      console.error('Get guest cart error:', error);
      throw error;
    }
  }

  /**
   * Initiate guest checkout
   */
  async initiateGuestCheckout(cartId, guestInfo, checkoutData = {}) {
    try {
      const { email, first_name, last_name, phone } = guestInfo;
      const { payment_method = 'stripe', billing_info } = checkoutData;

      // Validate required fields
      if (!email || !first_name || !last_name || !phone) {
        throw new Error('Email, first name, last name, and phone are required');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Invalid email format');
      }

      // Get cart
      const cart = await this.getGuestCart(cartId);

      if (!cart || !cart.items || cart.items.length === 0) {
        throw new Error('Cart is empty');
      }

      if (!billing_info) {
        throw new Error('Billing information is required');
      }

      // Generate confirmation code
      const confirmationCode = crypto
        .randomBytes(6)
        .toString('hex')
        .toUpperCase();

      // Calculate final amount
      const finalAmount = cart.total_amount - (cart.discount_amount || 0);

      // Create checkout session
      const checkoutId = uuidv4();
      const checkout = {
        id: checkoutId,
        cart_id: cartId,
        is_guest: true,
        guest_email: email,
        guest_first_name: first_name,
        guest_last_name: last_name,
        guest_phone: phone,
        confirmation_code: confirmationCode,
        payment_method,
        subtotal: cart.total_amount,
        discount_amount: cart.discount_amount || 0,
        total_amount: finalAmount,
        billing_info: JSON.stringify(billing_info),
        status: 'pending',
        created_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
      };

      const [createdCheckout] = await db('checkouts')
        .insert(checkout)
        .returning('*');

      return {
        checkoutId,
        confirmationCode,
        totalAmount: finalAmount,
        paymentMethod: payment_method,
        expiresAt: createdCheckout.expires_at
      };
    } catch (error) {
      console.error('Initiate guest checkout error:', error);
      throw error;
    }
  }

  /**
   * Complete guest checkout and create order
   */
  async completeGuestCheckout(cartId, billingData = {}) {
    try {
      // Get cart and items
      const cart = await this.getGuestCart(cartId);

      if (!cart) {
        throw new Error('Cart not found');
      }

      if (!cart.items || cart.items.length === 0) {
        throw new Error('Cart is empty');
      }

      // Extract billing info from the request (handle both camelCase from frontend and snake_case)
      const guestEmail = billingData.email || '';
      const guestFirstName = billingData.firstName || billingData.first_name || '';
      const guestLastName = billingData.lastName || billingData.last_name || '';
      const guestPhone = billingData.phone || '';
      const guestAddress = billingData.address || '';
      const guestCity = billingData.city || '';
      const guestState = billingData.state || '';
      const guestZip = billingData.zip || '';
      const guestCountry = billingData.country || '';

      if (!guestEmail || !guestFirstName || !guestLastName) {
        throw new Error('Email, first name, and last name are required');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(guestEmail)) {
        throw new Error('Invalid email address');
      }

      // Validate Zimbabwe phone number (263 or 0 prefix)
      const phoneRegex = /^(?:\+263|0)[\d\s\-()]{7,}$/;
      if (!guestPhone || !phoneRegex.test(guestPhone.replace(/\s/g, ''))) {
        throw new Error('Invalid Zimbabwe phone number (must start with +263 or 0)');
      }

      // Generate confirmation code
      const confirmationCode = this.generateConfirmationCode();

      // Calculate totals from cart items
      let subtotal = 0;
      for (const item of cart.items) {
        subtotal += Number(item.total_price || 0);
      }
      
      const taxRate = 0.08; // 8% tax
      const taxAmount = subtotal * taxRate;
      const totalAmount = subtotal + taxAmount;

      // Get raw cart items for ticket creation
      const cartItems = await db('shopping_cart_items')
        .where('cart_id', cartId);

      // Create tickets for each cart item
      const ticketsCreated = [];
      for (const cartItem of cartItems) {
        for (let i = 0; i < (cartItem.quantity || 1); i++) {
          const ticket = await ticketService.createTicket(
            {
              event_id: cartItem.event_id,
              ticket_type: cartItem.ticket_type,
              price: cartItem.total_price || cartItem.price || 0,
              status: 'confirmed',
              seat_number: cartItem.seat_numbers ? 
                (Array.isArray(cartItem.seat_numbers) ? cartItem.seat_numbers[i] : cartItem.seat_numbers) : 
                null
            }
          );
          ticketsCreated.push(ticket);
        }
      }

      // Store guest checkout record - update cart status to completed
      await db('shopping_carts')
        .where('id', cartId)
        .update({ 
          status: 'completed'
        });

      // Send confirmation email with tickets (non-blocking)
      const guestName = `${guestFirstName} ${guestLastName}`;

      if (guestEmail) {
        // Fire and forget - don't block checkout completion
        emailService.sendAdminNotification(
          guestEmail,
          `Your Tickets - Confirmation Code: ${confirmationCode}`,
          `Thank you for your purchase! Your ${ticketsCreated.length} ticket(s) are ready. Use confirmation code ${confirmationCode} to retrieve your tickets anytime.`,
          {
            confirmationCode: confirmationCode,
            totalAmount: totalAmount,
            ticketCount: ticketsCreated.length,
            guestName
          }
        ).catch(err => {
          console.warn('Failed to send confirmation email:', err.message);
        });
      } else {
        console.warn('No guest email provided, skipping confirmation email');
      }

      return {
        confirmationCode: confirmationCode,
        ticketsCreated: ticketsCreated.length,
        totalAmount: totalAmount,
        email: guestEmail,
        message: 'Checkout completed successfully'
      };
    } catch (error) {
      console.error('Complete guest checkout error:', error);
      throw error;
    }
  }  /**
   * Verify guest and retrieve tickets
   */
  async getGuestTickets(email, confirmationCode) {
    try {
      if (!email || !confirmationCode) {
        throw new Error('Email and confirmation code are required');
      }

      // Find order
      const order = await db('orders')
        .where('is_guest', true)
        .where('guest_email', email.toLowerCase())
        .where('confirmation_code', confirmationCode.toUpperCase())
        .first();

      if (!order) {
        throw new Error('Order not found. Please check your email and confirmation code.');
      }

      // Get tickets
      const tickets = await db('tickets')
        .leftJoin('events', 'tickets.event_id', 'events.id')
        .where('tickets.order_id', order.id)
        .select([
          'tickets.*',
          'events.title as event_title',
          'events.start_date as event_date',
          'events.venue_id'
        ]);

      // Get event details for each ticket
      const ticketsWithDetails = await Promise.all(
        tickets.map(async (ticket) => {
          const venue = await db('venues')
            .where('id', ticket.venue_id)
            .select('name', 'address', 'city')
            .first();

          return {
            ...ticket,
            venueName: venue?.name,
            venueAddress: venue?.address,
            venueCity: venue?.city
          };
        })
      );

      return {
        orderId: order.id,
        confirmationCode: order.confirmation_code,
        guestName: `${order.guest_first_name} ${order.guest_last_name}`,
        guestEmail: order.guest_email,
        totalAmount: order.total_amount,
        orderDate: order.created_at,
        status: order.status,
        ticketCount: tickets.length,
        tickets: ticketsWithDetails
      };
    } catch (error) {
      console.error('Get guest tickets error:', error);
      throw error;
    }
  }

  /**
   * Convert guest order to registered account
   */
  async convertGuestToAccount(email, confirmationCode, accountData) {
    try {
      const { password } = accountData;

      if (!password || password.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }

      // Verify guest order exists
      const order = await db('orders')
        .where('is_guest', true)
        .where('guest_email', email.toLowerCase())
        .where('confirmation_code', confirmationCode.toUpperCase())
        .first();

      if (!order) {
        throw new Error('Order not found');
      }

      // Check if account already exists
      const existingUser = await db('users')
        .where('email', email.toLowerCase())
        .first();

      if (existingUser) {
        throw new Error('An account with this email already exists');
      }

      // Create user account
      const userId = uuidv4();
      const bcrypt = require('bcrypt');
      const hashedPassword = await bcrypt.hash(password, 10);

      const user = {
        id: userId,
        email: email.toLowerCase(),
        password: hashedPassword,
        first_name: order.guest_first_name,
        last_name: order.guest_last_name,
        phone: order.guest_phone,
        role: 'customer',
        is_email_verified: true,
        created_at: new Date()
      };

      await db('users').insert(user);

      // Link all guest orders to account
      await db('orders')
        .where('guest_email', email.toLowerCase())
        .update({
          user_id: userId,
          is_guest: false
        });

      // Link all guest tickets to user
      const guestOrders = await db('orders')
        .where('user_id', userId)
        .select('id');

      for (const guestOrder of guestOrders) {
        await db('tickets')
          .where('order_id', guestOrder.id)
          .update({ user_id: userId });
      }

      return {
        userId,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        message: 'Account created successfully. All previous orders linked to your account.'
      };
    } catch (error) {
      console.error('Convert guest to account error:', error);
      throw error;
    }
  }

  /**
   * Send guest access link (resend)
   */
  async sendGuestAccessLink(email) {
    try {
      if (!email) {
        throw new Error('Email is required');
      }

      // Find guest orders
      const orders = await db('orders')
        .where('guest_email', email.toLowerCase())
        .where('status', 'confirmed')
        .orderBy('created_at', 'desc')
        .limit(1)
        .select('guest_email', 'confirmation_code', 'guest_first_name');

      if (orders.length === 0) {
        throw new Error('No orders found for this email');
      }

      const order = orders[0];

      // Send email with access link
      await emailService.sendAdminNotification(
        email,
        'Your Ticket Access Link',
        `Use the confirmation code below to retrieve your tickets: ${order.confirmation_code}`,
        {
          confirmationCode: order.confirmation_code,
          guestName: order.guest_first_name,
          retrievalLink: `${process.env.FRONTEND_URL}/tickets/guest?email=${encodeURIComponent(email)}&code=${order.confirmation_code}`
        }
      );

      return {
        success: true,
        message: `Access link sent to ${email}`,
        lastFourDigits: email.slice(-4)
      };
    } catch (error) {
      console.error('Send guest access link error:', error);
      throw error;
    }
  }

  /**
   * Get guest order history (by email + code)
   */
  async getGuestOrderHistory(email, confirmationCode) {
    try {
      const orders = await db('orders')
        .where('guest_email', email.toLowerCase())
        .where('confirmation_code', confirmationCode.toUpperCase())
        .orderBy('created_at', 'desc')
        .select([
          'id',
          'confirmation_code',
          'total_amount',
          'status',
          'created_at'
        ]);

      if (orders.length === 0) {
        throw new Error('No orders found');
      }

      // Get ticket count for each order
      const ordersWithTickets = await Promise.all(
        orders.map(async (order) => {
          const ticketCount = await db('tickets')
            .where('order_id', order.id)
            .count('id as count')
            .first();

          return {
            ...order,
            ticketCount: parseInt(ticketCount.count)
          };
        })
      );

      return ordersWithTickets;
    } catch (error) {
      console.error('Get guest order history error:', error);
      throw error;
    }
  }

  /**
   * Cleanup expired guest checkouts
   */
  async cleanupExpiredCheckouts() {
    try {
      const now = new Date();

      const expired = await db('checkouts')
        .where('is_guest', true)
        .where('status', 'pending')
        .where('expires_at', '<', now)
        .update({
          status: 'expired',
          updated_at: now
        });

      console.log(`Cleaned up ${expired} expired guest checkouts`);
      return { cleanedUp: expired };
    } catch (error) {
      console.error('Cleanup expired checkouts error:', error);
      throw error;
    }
  }

  /**
   * Archive old guest orders (>90 days)
   */
  async archiveOldGuestOrders() {
    try {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const archived = await db('orders')
        .where('is_guest', true)
        .where('created_at', '<', ninetyDaysAgo)
        .update({
          status: 'archived',
          updated_at: new Date()
        });

      console.log(`Archived ${archived} old guest orders`);
      return { archived };
    } catch (error) {
      console.error('Archive old guest orders error:', error);
      throw error;
    }
  }

  /**
   * Generate a random confirmation code
   */
  generateConfirmationCode() {
    return crypto
      .randomBytes(6)
      .toString('hex')
      .toUpperCase();
  }
}

module.exports = new GuestCheckoutService();
