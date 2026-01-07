const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditService = require('./auditService');
const ticketService = require('./ticketService');
const paymentService = require('./paymentService');
const approvalPaymentService = require('./approvalPaymentService');

class CartService {
  /**
   * Add item to cart
   */
  async addToCart(userId, cartItem) {
    try {
      const { event_id, seat_ids = [], ticket_type = 'general', quantity = 1, price } = cartItem;

      // Verify event exists
      const event = await db('events')
        .where('id', event_id)
        .whereNull('deleted_at')
        .first();

      if (!event) {
        throw new Error('Event not found');
      }

      // Get or create cart
      let cart = await db('shopping_carts')
        .where('user_id', userId)
        .where('status', 'active')
        .first();

      if (!cart) {
        const cartId = uuidv4();
        cart = {
          id: cartId,
          user_id: userId,
          status: 'active',
          created_at: new Date(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        };

        await db('shopping_carts').insert(cart);
      }

      // Add item to cart
      const cartItemId = uuidv4();
      const unitPrice = price || event.min_price || 0;
      const totalPrice = unitPrice * quantity;

      const newItem = {
        id: cartItemId,
        cart_id: cart.id,
        event_id,
        seat_numbers: seat_ids.length > 0 ? JSON.stringify(seat_ids) : null,
        ticket_type,
        quantity,
        unit_price: unitPrice,
        total_price: totalPrice
      };

      await db('shopping_cart_items').insert(newItem);

      // Update cart total
      const total = await this.calculateCartTotal(cart.id);
      await db('shopping_carts')
        .where('id', cart.id)
        .update({ total_amount: total });

      return {
        cartId: cart.id,
        item: newItem,
        cartTotal: total
      };
    } catch (error) {
      console.error('Add to cart error:', error);
      throw error;
    }
  }

  /**
   * Get user's cart
   */
  async getCart(userId) {
    try {
      const cart = await db('shopping_carts')
        .where('user_id', userId)
        .where('status', 'active')
        .first();

      if (!cart) {
        return null;
      }

      const items = await db('shopping_cart_items')
        .leftJoin('events', 'shopping_cart_items.event_id', 'events.id')
        .where('shopping_cart_items.cart_id', cart.id)
        .select([
          'shopping_cart_items.*',
          'events.title as event_title',
          'events.start_date as event_date'
        ]);

      // Parse seat numbers
      const parsedItems = items.map(item => ({
        ...item,
        seat_numbers: item.seat_numbers ? JSON.parse(item.seat_numbers) : []
      }));

      return {
        ...cart,
        items: parsedItems
      };
    } catch (error) {
      console.error('Get cart error:', error);
      throw error;
    }
  }

  /**
   * Remove item from cart
   */
  async removeFromCart(userId, itemId) {
    try {
      const cart = await db('shopping_carts')
        .where('user_id', userId)
        .where('status', 'active')
        .first();

      if (!cart) {
        throw new Error('Cart not found');
      }

      await db('shopping_cart_items')
        .where('id', itemId)
        .where('cart_id', cart.id)
        .delete();

      // Update cart total
      const total = await this.calculateCartTotal(cart.id);
      await db('shopping_carts')
        .where('id', cart.id)
        .update({ total_amount: total });

      return { cartTotal: total };
    } catch (error) {
      console.error('Remove from cart error:', error);
      throw error;
    }
  }

  /**
   * Update cart item quantity
   */
  async updateQuantity(userId, itemId, quantity) {
    try {
      if (quantity < 1) {
        return await this.removeFromCart(userId, itemId);
      }

      const cart = await db('shopping_carts')
        .where('user_id', userId)
        .where('status', 'active')
        .first();

      if (!cart) {
        throw new Error('Cart not found');
      }

      const item = await db('shopping_cart_items')
        .where('id', itemId)
        .where('cart_id', cart.id)
        .first();

      if (!item) {
        throw new Error('Cart item not found');
      }

      const newSubtotal = item.price * quantity;

      await db('shopping_cart_items')
        .where('id', itemId)
        .update({
          quantity,
          subtotal: newSubtotal
        });

      // Update cart total
      const total = await this.calculateCartTotal(cart.id);
      await db('shopping_carts')
        .where('id', cart.id)
        .update({ total_amount: total });

      return { cartTotal: total };
    } catch (error) {
      console.error('Update quantity error:', error);
      throw error;
    }
  }

  /**
   * Clear cart
   */
  async clearCart(userId) {
    try {
      // Try to clear database cart if table exists
      try {
        const cart = await db('shopping_carts')
          .where('user_id', userId)
          .where('status', 'active')
          .first();

        if (cart) {
          await db('shopping_cart_items')
            .where('cart_id', cart.id)
            .delete();

          await db('shopping_carts')
            .where('id', cart.id)
            .update({ total_amount: 0 });
        }
      } catch (tableError) {
        // If shopping_carts table doesn't exist, that's OK
        // The cart is managed on the frontend via CartContext
        if (tableError.code === '42P01') {
          // Table doesn't exist, skip
          console.log('Note: shopping_carts table not found, skipping database cart clear');
        } else {
          throw tableError;
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Clear cart error:', error);
      throw error;
    }
  }

  /**
   * Calculate cart total
   */
  async calculateCartTotal(cartId) {
    try {
      const result = await db('shopping_cart_items')
        .where('cart_id', cartId)
        .sum('total_price as total')
        .first();

      return result?.total || 0;
    } catch (error) {
      console.error('Calculate total error:', error);
      throw error;
    }
  }

  /**
   * Apply discount code
   */
  async applyDiscount(userId, discountCode) {
    try {
      const cart = await db('shopping_carts')
        .where('user_id', userId)
        .where('status', 'active')
        .first();

      if (!cart) {
        throw new Error('Cart not found');
      }

      // Get discount
      const discount = await db('discount_codes')
        .where('code', discountCode.toUpperCase())
        .where('is_active', true)
        .where('expires_at', '>', new Date())
        .first();

      if (!discount) {
        throw new Error('Invalid or expired discount code');
      }

      // Check if user has already used this code
      if (discount.max_uses_per_user) {
        const usageCount = await db('shopping_carts')
          .where('user_id', userId)
          .where('discount_code', discountCode.toUpperCase())
          .count('id as count')
          .first();

        if (usageCount.count >= discount.max_uses_per_user) {
          throw new Error('You have already used this discount code');
        }
      }

      // Apply discount
      await db('shopping_carts')
        .where('id', cart.id)
        .update({
          discount_code: discountCode.toUpperCase(),
          discount_percentage: discount.discount_percentage,
          discount_amount: Math.floor(cart.total_amount * (discount.discount_percentage / 100))
        });

      // Recalculate total with discount
      const discountAmount = Math.floor(cart.total_amount * (discount.discount_percentage / 100));
      const finalTotal = cart.total_amount - discountAmount;

      return {
        discountCode,
        discountPercentage: discount.discount_percentage,
        discountAmount,
        finalTotal
      };
    } catch (error) {
      console.error('Apply discount error:', error);
      throw error;
    }
  }

  /**
   * Remove discount code
   */
  async removeDiscount(userId) {
    try {
      const cart = await db('shopping_carts')
        .where('user_id', userId)
        .where('status', 'active')
        .first();

      if (!cart) {
        throw new Error('Cart not found');
      }

      await db('shopping_carts')
        .where('id', cart.id)
        .update({
          discount_code: null,
          discount_percentage: 0,
          discount_amount: 0
        });

      return { success: true };
    } catch (error) {
      console.error('Remove discount error:', error);
      throw error;
    }
  }
}

class CheckoutService {
  /**
   * Initiate checkout
   */
  async initiateCheckout(userId, checkoutData) {
    try {
      const { payment_method = 'stripe', billing_info } = checkoutData;

      // Get cart
      const cart = await db('shopping_carts')
        .where('user_id', userId)
        .where('status', 'active')
        .first();

      if (!cart || !cart.total_amount || cart.total_amount <= 0) {
        throw new Error('Cart is empty');
      }

      if (!cart.items) {
        const items = await db('shopping_cart_items')
          .where('cart_id', cart.id);
        cart.items = items;
      }

      if (!billing_info) {
        throw new Error('Billing information is required');
      }

      // Calculate final amount
      const finalAmount = cart.total_amount - (cart.discount_amount || 0);

      // Create checkout session
      const checkoutId = uuidv4();
      const checkout = {
        id: checkoutId,
        user_id: userId,
        cart_id: cart.id,
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

      // Log audit
      await auditService.log({
        userId,
        action: 'CHECKOUT_INITIATED',
        resource: 'checkouts',
        resourceId: checkoutId,
        newValues: {
          totalAmount: finalAmount,
          itemCount: cart.items.length
        }
      });

      return {
        checkoutId,
        totalAmount: finalAmount,
        paymentMethod: payment_method
      };
    } catch (error) {
      console.error('Initiate checkout error:', error);
      throw error;
    }
  }

  /**
   * Complete checkout and create order
   */
  async completeCheckout(userId, checkoutId, paymentData) {
    try {
      const { payment_intent_id, stripe_token } = paymentData;

      // Get checkout
      const checkout = await db('checkouts')
        .where('id', checkoutId)
        .where('user_id', userId)
        .where('status', 'pending')
        .first();

      if (!checkout) {
        throw new Error('Checkout not found or already processed');
      }

      // Verify payment
      const payment = await db('payments')
        .where('id', payment_intent_id)
        .where('user_id', userId)
        .where('status', 'completed')
        .first();

      if (!payment) {
        throw new Error('Payment not found or not completed');
      }

      // Get cart items
      const cartItems = await db('shopping_cart_items')
        .where('cart_id', checkout.cart_id);

      // Create order
      const orderId = uuidv4();
      const order = {
        id: orderId,
        user_id: userId,
        checkout_id: checkoutId,
        payment_id: payment_intent_id,
        subtotal: checkout.subtotal,
        discount_amount: checkout.discount_amount,
        total_amount: checkout.total_amount,
        status: 'confirmed',
        billing_info: checkout.billing_info,
        created_at: new Date()
      };

      const [createdOrder] = await db('orders')
        .insert(order)
        .returning('*');

      // Create tickets for each cart item
      const ticketsCreated = [];
      const eventRevenue = {}; // Track revenue per organizer
      const ticketsByEvent = {}; // Track ticket quantities per event

      for (const cartItem of cartItems) {
        for (let i = 0; i < cartItem.quantity; i++) {
          const ticket = await ticketService.createTicket(
            {
              event_id: cartItem.event_id,
              order_id: orderId,
              ticket_type: cartItem.ticket_type,
              price: cartItem.price,
              status: 'confirmed'
            },
            userId
          );
          ticketsCreated.push(ticket);

          // Track revenue for each event
          if (!eventRevenue[cartItem.event_id]) {
            eventRevenue[cartItem.event_id] = 0;
          }
          eventRevenue[cartItem.event_id] += cartItem.price;

          // Track ticket quantities per event
          if (!ticketsByEvent[cartItem.event_id]) {
            ticketsByEvent[cartItem.event_id] = 0;
          }
          ticketsByEvent[cartItem.event_id]++;
        }
      }

      // Update event ticket availability
      for (const eventId in ticketsByEvent) {
        await db('events')
          .where('id', eventId)
          .increment('sold_tickets', ticketsByEvent[eventId])
          .decrement('available_tickets', ticketsByEvent[eventId]);
      }

      // Record earnings for organizers of each event
      for (const eventId in eventRevenue) {
        try {
          const event = await db('events')
            .where('id', eventId)
            .select('organizer_id')
            .first();

          if (event && event.organizer_id) {
            await approvalPaymentService.addEarnings(
              event.organizer_id,
              eventRevenue[eventId],
              'ticket_sale'
            );
          }
        } catch (earnError) {
          console.error(`Error recording earnings for event ${eventId}:`, earnError);
          // Don't fail the checkout if earnings recording fails
        }
      }

      // Update checkout status
      await db('checkouts')
        .where('id', checkoutId)
        .update({
          status: 'completed',
          order_id: orderId,
          completed_at: new Date()
        });

      // Move cart to completed
      await db('shopping_carts')
        .where('id', checkout.cart_id)
        .update({ status: 'completed' });

      // Log audit
      await auditService.log({
        userId,
        action: 'CHECKOUT_COMPLETED',
        resource: 'checkouts',
        resourceId: checkoutId,
        newValues: {
          orderId,
          totalAmount: checkout.total_amount,
          ticketsCreated: ticketsCreated.length
        }
      });

      return {
        orderId,
        ticketsCreated: ticketsCreated.length,
        totalAmount: checkout.total_amount
      };
    } catch (error) {
      console.error('Complete checkout error:', error);
      throw error;
    }
  }

  /**
   * Get checkout details
   */
  async getCheckout(checkoutId, userId) {
    try {
      const checkout = await db('checkouts')
        .where('id', checkoutId)
        .where('user_id', userId)
        .first();

      if (!checkout) {
        throw new Error('Checkout not found');
      }

      // Get related cart items
      const items = await db('shopping_cart_items')
        .where('cart_id', checkout.cart_id);

      return {
        ...checkout,
        items,
        billingInfo: JSON.parse(checkout.billing_info)
      };
    } catch (error) {
      console.error('Get checkout error:', error);
      throw error;
    }
  }

  /**
   * Cancel checkout
   */
  async cancelCheckout(checkoutId, userId) {
    try {
      const checkout = await db('checkouts')
        .where('id', checkoutId)
        .where('user_id', userId)
        .first();

      if (!checkout) {
        throw new Error('Checkout not found');
      }

      await db('checkouts')
        .where('id', checkoutId)
        .update({
          status: 'cancelled',
          cancelled_at: new Date()
        });

      // Log audit
      await auditService.log({
        userId,
        action: 'CHECKOUT_CANCELLED',
        resource: 'checkouts',
        resourceId: checkoutId
      });

      return { success: true };
    } catch (error) {
      console.error('Cancel checkout error:', error);
      throw error;
    }
  }
}

module.exports = {
  CartService: new CartService(),
  CheckoutService: new CheckoutService()
};
