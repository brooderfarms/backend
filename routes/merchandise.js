const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireRole } = require('../middleware/auth');
const crypto = require('crypto');

// GET all available merchandise types
router.get('/types', async (req, res) => {
  try {
    const { category, is_active } = req.query;

    let query = db('merchandise_types').whereNull('deleted_at');

    if (category) {
      query = query.where('category', category);
    }

    if (is_active !== undefined) {
      query = query.where('is_active', is_active === 'true');
    }

    const types = await query
      .select('*')
      .orderBy('category', 'asc')
      .orderBy('name', 'asc');

    res.json({ success: true, data: types });
  } catch (err) {
    console.error('Get merchandise types error:', err);
    res.status(500).json({ error: 'Failed to fetch merchandise types' });
  }
});

// GET single merchandise type with customizations
router.get('/types/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const merchandise = await db('merchandise_types')
      .where('id', id)
      .whereNull('deleted_at')
      .first();

    if (!merchandise) {
      return res.status(404).json({ error: 'Merchandise type not found' });
    }

    // Get customization options
    const customizations = await db('merchandise_customizations')
      .where('merchandise_type_id', id)
      .where('is_active', true)
      .select('*');

    // Get design templates
    const templates = await db('merchandise_design_templates')
      .where('merchandise_type_id', id)
      .where('is_public', true)
      .where('is_active', true)
      .select('id', 'name', 'description', 'template_image_url', 'preview_image_url');

    res.json({
      success: true,
      data: {
        ...merchandise,
        customizations,
        templates
      }
    });
  } catch (err) {
    console.error('Get merchandise type error:', err);
    res.status(500).json({ error: 'Failed to fetch merchandise type' });
  }
});

// CREATE new merchandise order
router.post('/orders', verifyToken, async (req, res) => {
  try {
    const { id: userId } = req.user;
    const {
      items, // Array of { merchandise_type_id, quantity, customizations, custom_text, logo_url, design_data }
      delivery_address,
      delivery_city,
      delivery_country,
      delivery_postal_code,
      requested_delivery_date,
      special_instructions
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // Calculate totals
    let subtotal = 0;
    let customizationCost = 0;

    const orderItems = [];

    for (const item of items) {
      const merchandise = await db('merchandise_types')
        .where('id', item.merchandise_type_id)
        .first();

      if (!merchandise) {
        return res.status(404).json({ error: `Merchandise type ${item.merchandise_type_id} not found` });
      }

      // Validate quantity
      if (item.quantity < merchandise.min_quantity || item.quantity > merchandise.max_quantity) {
        return res.status(400).json({
          error: `Quantity for ${merchandise.name} must be between ${merchandise.min_quantity} and ${merchandise.max_quantity}`
        });
      }

      const itemSubtotal = merchandise.base_price * item.quantity;
      subtotal += itemSubtotal;

      // Calculate customization costs
      let itemCustomizationCost = 0;
      if (item.customizations) {
        for (const customId of item.customizations) {
          const custom = await db('merchandise_customizations')
            .where('id', customId)
            .first();
          if (custom) {
            itemCustomizationCost += custom.additional_cost * item.quantity;
          }
        }
      }
      customizationCost += itemCustomizationCost;

      orderItems.push({
        merchandise_type_id: item.merchandise_type_id,
        quantity: item.quantity,
        unit_price: merchandise.base_price,
        customization_selections: item.customizations || [],
        custom_text: item.custom_text,
        logo_url: item.logo_url,
        design_data: item.design_data
      });
    }

    // Calculate shipping and tax (simplified)
    const shippingCost = subtotal > 500 ? 0 : 25;
    const tax = (subtotal + customizationCost + shippingCost) * 0.1; // 10% tax
    const totalAmount = subtotal + customizationCost + shippingCost + tax;

    // Create order
    const order = {
      user_id: userId,
      order_number: orderNumber,
      status: 'pending',
      subtotal,
      customization_cost: customizationCost,
      shipping_cost: shippingCost,
      tax,
      total_amount: totalAmount,
      delivery_address,
      delivery_city,
      delivery_country,
      delivery_postal_code,
      requested_delivery_date: requested_delivery_date ? new Date(requested_delivery_date) : null,
      special_instructions,
      metadata: {
        item_count: items.length
      }
    };

    const [orderId] = await db('merchandise_orders').insert(order);

    // Add order items
    for (const item of orderItems) {
      await db('merchandise_order_items').insert({
        order_id: orderId,
        ...item
      });
    }

    const createdOrder = await db('merchandise_orders')
      .where('id', orderId)
      .first();

    res.status(201).json({ success: true, data: createdOrder });
  } catch (err) {
    console.error('Create merchandise order error:', err);
    res.status(500).json({ error: 'Failed to create merchandise order' });
  }
});

// GET user's merchandise orders
router.get('/orders', verifyToken, async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { page = 1, limit = 10, status } = req.query;

    const offset = (page - 1) * limit;

    let query = db('merchandise_orders')
      .where('user_id', userId)
      .whereNull('deleted_at');

    if (status) {
      query = query.where('status', status);
    }

    const orders = await query
      .select('*')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const countQuery = db('merchandise_orders')
      .where('user_id', userId)
      .whereNull('deleted_at');

    if (status) {
      countQuery.where('status', status);
    }

    const { count } = await countQuery.count('* as count').first();

    res.json({
      success: true,
      data: orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(count),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    console.error('Get merchandise orders error:', err);
    res.status(500).json({ error: 'Failed to fetch merchandise orders' });
  }
});

// GET single order with items
router.get('/orders/:orderId', verifyToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { id: userId } = req.user;

    const order = await db('merchandise_orders')
      .where('id', orderId)
      .where('user_id', userId)
      .whereNull('deleted_at')
      .first();

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const items = await db('merchandise_order_items')
      .leftJoin('merchandise_types', 'merchandise_order_items.merchandise_type_id', 'merchandise_types.id')
      .where('merchandise_order_items.order_id', orderId)
      .select(
        'merchandise_order_items.*',
        'merchandise_types.name',
        'merchandise_types.category',
        'merchandise_types.material'
      );

    res.json({
      success: true,
      data: {
        ...order,
        items
      }
    });
  } catch (err) {
    console.error('Get merchandise order error:', err);
    res.status(500).json({ error: 'Failed to fetch merchandise order' });
  }
});

// CANCEL merchandise order
router.post('/orders/:orderId/cancel', verifyToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { id: userId } = req.user;

    const order = await db('merchandise_orders')
      .where('id', orderId)
      .where('user_id', userId)
      .whereNull('deleted_at')
      .first();

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Only allow cancellation if not yet in production
    if (['production', 'ready', 'shipped', 'delivered'].includes(order.status)) {
      return res.status(400).json({ error: 'Cannot cancel order in current status' });
    }

    await db('merchandise_orders').where('id', orderId).update({
      status: 'cancelled',
      updated_at: new Date()
    });

    const updatedOrder = await db('merchandise_orders').where('id', orderId).first();

    res.json({ success: true, data: updatedOrder });
  } catch (err) {
    console.error('Cancel merchandise order error:', err);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// ADMIN: Update order status
router.put('/orders/:orderId/status', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ['draft', 'pending', 'approved', 'production', 'ready', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const order = await db('merchandise_orders').where('id', orderId).first();
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const updates = {
      status,
      updated_at: new Date()
    };

    // Set estimated delivery date if approving
    if (status === 'approved') {
      const deliveryDate = new Date();
      deliveryDate.setDate(deliveryDate.getDate() + 14); // 2 weeks production time
      updates.estimated_delivery_date = deliveryDate;
    }

    // Set actual delivery date if delivered
    if (status === 'delivered') {
      updates.actual_delivery_date = new Date();
    }

    await db('merchandise_orders').where('id', orderId).update(updates);

    const updatedOrder = await db('merchandise_orders').where('id', orderId).first();

    res.json({ success: true, data: updatedOrder });
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// CREATE replacement order for lost items (with penalty fee)
router.post('/orders/:orderId/request-replacement', verifyToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { id: userId } = req.user;
    const { items, reason, penalty_multiplier = 1.15 } = req.body;

    // Verify original order exists and belongs to user
    const originalOrder = await db('merchandise_orders')
      .where('id', orderId)
      .where('user_id', userId)
      .first();

    if (!originalOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (originalOrder.status !== 'delivered') {
      return res.status(400).json({ error: 'Only delivered orders can be replaced' });
    }

    // Get items from the original order
    const originalItems = await db('merchandise_order_items')
      .where('order_id', orderId)
      .select('*');

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Please select at least one item to replace' });
    }

    // Calculate replacement cost with penalty
    let subtotal = 0;
    let penaltyCost = 0;

    const replacementItems = [];

    for (const itemRequest of items) {
      const originalItem = originalItems.find(oi => oi.id === itemRequest.item_id);
      if (!originalItem) {
        return res.status(404).json({ error: `Item ${itemRequest.item_id} not found in original order` });
      }

      const baseCost = originalItem.unit_price * itemRequest.quantity;
      const penalty = baseCost * (penalty_multiplier - 1);

      subtotal += baseCost;
      penaltyCost += penalty;

      replacementItems.push({
        original_item_id: originalItem.id,
        merchandise_type_id: originalItem.merchandise_type_id,
        quantity: itemRequest.quantity,
        unit_price: originalItem.unit_price,
        customization_selections: originalItem.customization_selections,
        custom_text: originalItem.custom_text,
        logo_url: originalItem.logo_url
      });
    }

    // Calculate totals
    const shipping = subtotal > 500 ? 0 : 15;
    const tax = (subtotal + penaltyCost + shipping) * 0.1;
    const totalAmount = subtotal + penaltyCost + shipping + tax;

    // Generate replacement order number
    const replacementOrderNumber = `REP-${originalOrder.order_number}-${Date.now().toString().slice(-6)}`;

    // Create replacement order
    const replacementOrder = {
      user_id: userId,
      order_number: replacementOrderNumber,
      original_order_id: orderId,
      status: 'pending',
      subtotal,
      penalty_cost: penaltyCost,
      customization_cost: 0,
      shipping_cost: shipping,
      tax,
      total_amount: totalAmount,
      delivery_address: originalOrder.delivery_address,
      delivery_city: originalOrder.delivery_city,
      delivery_country: originalOrder.delivery_country,
      delivery_postal_code: originalOrder.delivery_postal_code,
      special_instructions: `REPLACEMENT (${reason || 'Lost item'}). Original Order: ${originalOrder.order_number}`,
      replacement_reason: reason,
      replacement_multiplier: penalty_multiplier,
      metadata: {
        item_count: replacementItems.length,
        is_replacement: true,
        reason: reason || 'Lost item'
      }
    };

    const [replacementOrderId] = await db('merchandise_orders').insert(replacementOrder);

    // Add replacement items
    for (const item of replacementItems) {
      await db('merchandise_order_items').insert({
        order_id: replacementOrderId,
        ...item
      });
    }

    const createdReplacement = await db('merchandise_orders')
      .where('id', replacementOrderId)
      .first();

    res.status(201).json({
      success: true,
      message: 'Replacement order created successfully. Penalty fee of ' + 
               (penalty_multiplier * 100 - 100).toFixed(0) + '% applied.',
      data: createdReplacement
    });
  } catch (err) {
    console.error('Create replacement order error:', err);
    res.status(500).json({ error: 'Failed to create replacement order' });
  }
});

module.exports = router;
