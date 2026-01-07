const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireRole } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const auditService = require('../services/auditService');

// ======================== VENDOR MANAGEMENT ========================

/**
 * GET /api/vendors - List all vendors (public)
 */
router.get('/', async (req, res) => {
  try {
    const { event_id, category, status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let query = db('vendors')
      .leftJoin('users', 'vendors.user_id', 'users.id')
      .whereNull('vendors.deleted_at');

    // Only filter by status if explicitly provided
    if (status) query = query.where('vendors.status', status);
    if (event_id) query = query.where('vendors.event_id', event_id);
    if (category) query = query.where('vendors.category', category);

    const vendors = await query
      .select('vendors.*', 'users.first_name', 'users.last_name', 'users.email')
      .orderBy('vendors.rating', 'desc')
      .limit(limit)
      .offset(offset);

    const total = await db('vendors')
      .whereNull('deleted_at')
      .where(qb => {
        if (status) qb.where('status', status);
        if (event_id) qb.where('event_id', event_id);
        if (category) qb.where('category', category);
      })
      .count('* as count')
      .first();

    res.json({
      success: true,
      data: {
        vendors,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.count),
          pages: Math.ceil(total.count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch vendors' });
  }
});

/**
 * GET /api/vendors/:vendorId - Get vendor details
 */
router.get('/:vendorId', async (req, res) => {
  try {
    const { vendorId } = req.params;

    const vendor = await db('vendors')
      .leftJoin('users', 'vendors.user_id', 'users.id')
      .where('vendors.id', vendorId)
      .whereNull('vendors.deleted_at')
      .select('vendors.*', 'users.first_name', 'users.last_name', 'users.email')
      .first();

    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    res.json({ success: true, data: vendor });
  } catch (error) {
    console.error('Get vendor error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch vendor' });
  }
});

/**
 * POST /api/vendors - Create vendor (authenticated)
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      event_id,
      vendor_name,
      description,
      category,
      contact_phone,
      contact_email,
      website,
      business_license,
      booth_location,
      booth_size,
      bank_details
    } = req.body;

    if (!vendor_name) {
      return res.status(400).json({
        success: false,
        message: 'Vendor name is required'
      });
    }

    const vendorId = uuidv4();
    const vendor = {
      id: vendorId,
      user_id: req.user.id,
      event_id: event_id || null, // Allow NULL for general vendor accounts
      vendor_name,
      description,
      category: category || 'other',
      contact_phone,
      contact_email: contact_email || req.user.email,
      website,
      business_license,
      booth_location,
      booth_size,
      bank_details,
      status: 'pending',
      created_at: new Date()
    };

    await db('vendors').insert(vendor);

    await auditService.log({
      userId: req.user.id,
      action: 'VENDOR_CREATED',
      resource: 'vendors',
      resourceId: vendorId,
      newValues: vendor
    });

    res.status(201).json({
      success: true,
      message: 'Vendor created successfully',
      data: vendor
    });
  } catch (error) {
    console.error('Create vendor error:', error);
    res.status(500).json({ success: false, message: 'Failed to create vendor' });
  }
});

/**
 * PUT /api/vendors/:vendorId - Update vendor
 */
router.put('/:vendorId', verifyToken, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const vendor = await db('vendors').where('id', vendorId).first();

    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    if (vendor.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const allowedFields = [
      'vendor_name', 'description', 'category', 'contact_phone',
      'contact_email', 'website', 'booth_location', 'booth_size',
      'logo_url', 'bank_details', 'additional_info'
    ];

    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    updates.updated_at = new Date();

    await db('vendors').where('id', vendorId).update(updates);

    await auditService.log({
      userId: req.user.id,
      action: 'VENDOR_UPDATED',
      resource: 'vendors',
      resourceId: vendorId,
      newValues: updates
    });

    res.json({ success: true, message: 'Vendor updated successfully', data: updates });
  } catch (error) {
    console.error('Update vendor error:', error);
    res.status(500).json({ success: false, message: 'Failed to update vendor' });
  }
});

/**
 * DELETE /api/vendors/:vendorId - Delete vendor
 */
router.delete('/:vendorId', verifyToken, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const vendor = await db('vendors').where('id', vendorId).first();

    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    if (vendor.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    await db('vendors').where('id', vendorId).update({ deleted_at: new Date() });

    await auditService.log({
      userId: req.user.id,
      action: 'VENDOR_DELETED',
      resource: 'vendors',
      resourceId: vendorId
    });

    res.json({ success: true, message: 'Vendor deleted successfully' });
  } catch (error) {
    console.error('Delete vendor error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete vendor' });
  }
});

/**
 * POST /api/vendors/:vendorId/approve - Approve vendor (admin only)
 */
router.post('/:vendorId/approve', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { vendorId } = req.params;
    
    const vendor = await db('vendors').where('id', vendorId).first();
    
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    await db('vendors').where('id', vendorId).update({
      status: 'approved',
      updated_at: new Date()
    });

    await auditService.log({
      userId: req.user.id,
      action: 'VENDOR_APPROVED',
      resource: 'vendors',
      resourceId: vendorId,
      details: `Vendor ${vendor.vendor_name} approved`
    });

    res.json({
      success: true,
      message: 'Vendor approved successfully',
      data: { ...vendor, status: 'approved' }
    });
  } catch (error) {
    console.error('Approve vendor error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve vendor' });
  }
});

/**
 * POST /api/vendors/:vendorId/reject - Reject vendor (admin only)
 */
router.post('/:vendorId/reject', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { reason } = req.body;
    
    const vendor = await db('vendors').where('id', vendorId).first();
    
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    await db('vendors').where('id', vendorId).update({
      status: 'rejected',
      rejection_reason: reason,
      updated_at: new Date()
    });

    await auditService.log({
      userId: req.user.id,
      action: 'VENDOR_REJECTED',
      resource: 'vendors',
      resourceId: vendorId,
      details: `Vendor ${vendor.vendor_name} rejected: ${reason}`
    });

    res.json({
      success: true,
      message: 'Vendor rejected',
      data: { ...vendor, status: 'rejected' }
    });
  } catch (error) {
    console.error('Reject vendor error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject vendor' });
  }
});

// ======================== VENDOR PRODUCTS ========================

/**
 * GET /api/vendors/:vendorId/products - Get vendor's products
 */
router.get('/:vendorId/products', async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { category, is_available, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let query = db('vendor_products')
      .where('vendor_id', vendorId)
      .whereNull('deleted_at');

    if (category) query = query.where('category', category);
    if (is_available !== undefined) query = query.where('is_available', is_available === 'true');

    const products = await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const total = await db('vendor_products')
      .where('vendor_id', vendorId)
      .whereNull('deleted_at')
      .count('* as count')
      .first();

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.count)
        }
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

/**
 * POST /api/vendors/:vendorId/products - Add product
 */
router.post('/:vendorId/products', verifyToken, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { name, description, price, cost, category, image_url, stock } = req.body;

    const vendor = await db('vendors').where('id', vendorId).first();
    if (!vendor || vendor.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const productId = uuidv4();
    const product = {
      id: productId,
      vendor_id: vendorId,
      name,
      description,
      price,
      cost,
      category: category || 'other',
      image_url,
      stock: stock || 0,
      is_available: true,
      created_at: new Date()
    };

    await db('vendor_products').insert(product);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ success: false, message: 'Failed to create product' });
  }
});

/**
 * PUT /api/vendors/:vendorId/products/:productId - Update product
 */
router.put('/:vendorId/products/:productId', verifyToken, async (req, res) => {
  try {
    const { vendorId, productId } = req.params;

    const vendor = await db('vendors').where('id', vendorId).first();
    if (!vendor || vendor.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const allowedFields = ['name', 'description', 'price', 'cost', 'category', 'image_url', 'stock', 'is_available'];
    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    updates.updated_at = new Date();

    await db('vendor_products').where('id', productId).update(updates);

    res.json({ success: true, message: 'Product updated successfully', data: updates });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ success: false, message: 'Failed to update product' });
  }
});

/**
 * DELETE /api/vendors/:vendorId/products/:productId - Delete product
 */
router.delete('/:vendorId/products/:productId', verifyToken, async (req, res) => {
  try {
    const { vendorId, productId } = req.params;

    const vendor = await db('vendors').where('id', vendorId).first();
    if (!vendor || vendor.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    await db('vendor_products').where('id', productId).update({ deleted_at: new Date() });

    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
});

// ======================== VENDOR ORDERS ========================

/**
 * GET /api/vendors/:vendorId/orders - Get vendor's orders
 */
router.get('/:vendorId/orders', verifyToken, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { fulfillment_status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const vendor = await db('vendors').where('id', vendorId).first();
    if (!vendor || vendor.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    let query = db('vendor_orders')
      .where('vendor_id', vendorId);

    if (fulfillment_status) query = query.where('fulfillment_status', fulfillment_status);

    const orders = await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const total = await db('vendor_orders')
      .where('vendor_id', vendorId)
      .count('* as count')
      .first();

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.count)
        }
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

/**
 * PUT /api/vendors/:vendorId/orders/:orderId - Update order status
 */
router.put('/:vendorId/orders/:orderId', verifyToken, async (req, res) => {
  try {
    const { vendorId, orderId } = req.params;
    const { fulfillment_status } = req.body;

    const vendor = await db('vendors').where('id', vendorId).first();
    if (!vendor || vendor.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const updates = { fulfillment_status, updated_at: new Date() };
    if (fulfillment_status === 'completed') {
      updates.completed_at = new Date();
    }

    await db('vendor_orders').where('id', orderId).update(updates);

    res.json({ success: true, message: 'Order updated successfully', data: updates });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ success: false, message: 'Failed to update order' });
  }
});

/**
 * GET /api/vendors/:vendorId/sales - Get vendor sales analytics
 */
router.get('/:vendorId/sales', verifyToken, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { timeRange = '30days' } = req.query;

    const vendor = await db('vendors').where('id', vendorId).first();
    if (!vendor || vendor.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const dateFilter = new Date();
    if (timeRange === '7days') dateFilter.setDate(dateFilter.getDate() - 7);
    else if (timeRange === '30days') dateFilter.setDate(dateFilter.getDate() - 30);
    else if (timeRange === '90days') dateFilter.setDate(dateFilter.getDate() - 90);
    else if (timeRange === 'year') dateFilter.setFullYear(dateFilter.getFullYear() - 1);

    const orders = await db('vendor_orders')
      .where('vendor_id', vendorId)
      .where('created_at', '>=', dateFilter);

    const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total_amount), 0);
    const totalOrders = orders.length;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const productStats = await db('vendor_products')
      .where('vendor_id', vendorId)
      .select('name', 'quantity_sold', 'total_revenue', 'stock', 'sold');

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalOrders,
        averageOrderValue,
        vendorRating: vendor.rating,
        totalReviews: vendor.total_reviews,
        productStats
      }
    });
  } catch (error) {
    console.error('Get sales analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sales analytics' });
  }
});

module.exports = router;
