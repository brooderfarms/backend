const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const { CartService, CheckoutService } = require('../services/cartCheckoutService');
const auditService = require('../services/auditService');

/**
 * Get user's current cart
 * GET /api/cart
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const cart = await CartService.getCart(req.user.id);

    res.json({
      success: true,
      data: cart
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cart'
    });
  }
});

/**
 * Add item to cart
 * POST /api/cart/add
 */
router.post('/add', verifyToken, async (req, res) => {
  try {
    const { event_id, seat_ids, ticket_type, quantity, price } = req.body;

    if (!event_id) {
      return res.status(400).json({
        success: false,
        message: 'event_id is required'
      });
    }

    const result = await CartService.addToCart(req.user.id, {
      event_id,
      seat_ids: seat_ids || [],
      ticket_type: ticket_type || 'general',
      quantity: quantity || 1,
      price
    });

    res.status(201).json({
      success: true,
      message: 'Item added to cart',
      data: result
    });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add item to cart'
    });
  }
});

/**
 * Remove item from cart
 * DELETE /api/cart/items/:itemId
 */
router.delete('/items/:itemId', verifyToken, async (req, res) => {
  try {
    const { itemId } = req.params;

    const result = await CartService.removeFromCart(req.user.id, itemId);

    res.json({
      success: true,
      message: 'Item removed from cart',
      data: result
    });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to remove item'
    });
  }
});

/**
 * Update cart item quantity
 * PUT /api/cart/items/:itemId
 */
router.put('/items/:itemId', verifyToken, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (quantity === undefined || quantity === null) {
      return res.status(400).json({
        success: false,
        message: 'quantity is required'
      });
    }

    const result = await CartService.updateQuantity(req.user.id, itemId, quantity);

    res.json({
      success: true,
      message: 'Quantity updated',
      data: result
    });
  } catch (error) {
    console.error('Update quantity error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update quantity'
    });
  }
});

/**
 * Clear cart
 * DELETE /api/cart
 */
router.delete('/', verifyToken, async (req, res) => {
  try {
    await CartService.clearCart(req.user.id);

    res.json({
      success: true,
      message: 'Cart cleared'
    });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cart'
    });
  }
});

/**
 * Apply discount code
 * POST /api/cart/discount
 */
router.post('/discount', verifyToken, async (req, res) => {
  try {
    const { discount_code } = req.body;

    if (!discount_code) {
      return res.status(400).json({
        success: false,
        message: 'discount_code is required'
      });
    }

    const result = await CartService.applyDiscount(req.user.id, discount_code);

    res.json({
      success: true,
      message: 'Discount applied',
      data: result
    });
  } catch (error) {
    console.error('Apply discount error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to apply discount'
    });
  }
});

/**
 * Remove discount code
 * DELETE /api/cart/discount
 */
router.delete('/discount', verifyToken, async (req, res) => {
  try {
    await CartService.removeDiscount(req.user.id);

    res.json({
      success: true,
      message: 'Discount removed'
    });
  } catch (error) {
    console.error('Remove discount error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove discount'
    });
  }
});

/**
 * Initiate checkout
 * POST /api/checkout/initiate
 */
router.post('/initiate', verifyToken, async (req, res) => {
  try {
    const { payment_method, billing_info } = req.body;

    if (!billing_info) {
      return res.status(400).json({
        success: false,
        message: 'billing_info is required'
      });
    }

    const result = await CheckoutService.initiateCheckout(req.user.id, {
      payment_method: payment_method || 'stripe',
      billing_info
    });

    res.status(201).json({
      success: true,
      message: 'Checkout initiated',
      data: result
    });
  } catch (error) {
    console.error('Initiate checkout error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to initiate checkout'
    });
  }
});

/**
 * Complete checkout
 * POST /api/checkout/complete
 */
router.post('/complete', verifyToken, async (req, res) => {
  try {
    const { checkout_id, payment_intent_id, stripe_token } = req.body;

    if (!checkout_id || !payment_intent_id) {
      return res.status(400).json({
        success: false,
        message: 'checkout_id and payment_intent_id are required'
      });
    }

    const result = await CheckoutService.completeCheckout(
      req.user.id,
      checkout_id,
      {
        payment_intent_id,
        stripe_token
      }
    );

    // Log successful order
    await auditService.log({
      userId: req.user.id,
      action: 'ORDER_COMPLETED',
      resource: 'orders',
      resourceId: result.orderId,
      newValues: {
        totalAmount: result.totalAmount,
        ticketsCount: result.ticketsCreated
      }
    });

    res.json({
      success: true,
      message: 'Checkout completed successfully',
      data: result
    });
  } catch (error) {
    console.error('Complete checkout error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to complete checkout'
    });
  }
});

/**
 * Get checkout details
 * GET /api/checkout/:checkoutId
 */
router.get('/:checkoutId', verifyToken, async (req, res) => {
  try {
    const { checkoutId } = req.params;

    const checkout = await CheckoutService.getCheckout(checkoutId, req.user.id);

    res.json({
      success: true,
      data: checkout
    });
  } catch (error) {
    console.error('Get checkout error:', error);
    res.status(404).json({
      success: false,
      message: error.message || 'Checkout not found'
    });
  }
});

/**
 * Cancel checkout
 * POST /api/checkout/:checkoutId/cancel
 */
router.post('/:checkoutId/cancel', verifyToken, async (req, res) => {
  try {
    const { checkoutId } = req.params;

    await CheckoutService.cancelCheckout(checkoutId, req.user.id);

    res.json({
      success: true,
      message: 'Checkout cancelled'
    });
  } catch (error) {
    console.error('Cancel checkout error:', error);
    res.status(404).json({
      success: false,
      message: error.message || 'Failed to cancel checkout'
    });
  }
});

/**
 * Get user's orders
 * GET /api/checkout/orders
 */
router.get('/orders', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    let query = db('orders')
      .leftJoin('payments', 'orders.payment_id', 'payments.id')
      .where('orders.user_id', req.user.id)
      .select([
        'orders.*',
        'payments.gateway as payment_gateway',
        'payments.status as payment_status'
      ]);

    if (status) {
      query = query.where('orders.status', status);
    }

    const totalQuery = query.clone().clearSelect().clearOrder().count('orders.id as count').first();
    const [orders, total] = await Promise.all([
      query
        .orderBy('orders.created_at', 'desc')
        .limit(limit)
        .offset(offset),
      totalQuery
    ]);

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

    res.json({
      success: true,
      data: {
        orders: ordersWithTickets,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.count),
          pages: Math.ceil(total.count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
});

/**
 * Get order details
 * GET /api/checkout/orders/:orderId
 */
router.get('/orders/:orderId', verifyToken, async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await db('orders')
      .leftJoin('payments', 'orders.payment_id', 'payments.id')
      .where('orders.id', orderId)
      .where('orders.user_id', req.user.id)
      .select([
        'orders.*',
        'payments.gateway as payment_gateway',
        'payments.status as payment_status'
      ])
      .first();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get tickets
    const tickets = await db('tickets')
      .where('order_id', orderId)
      .select('*');

    res.json({
      success: true,
      data: {
        order,
        tickets,
        billingInfo: JSON.parse(order.billing_info)
      }
    });
  } catch (error) {
    console.error('Get order details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details'
    });
  }
});

module.exports = router;
