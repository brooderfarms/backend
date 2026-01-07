const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireRole, requireOwnershipOrAdmin } = require('../middleware/auth');
const { validatePagination, validateUUID } = require('../middleware/validation');

// Get organizers (public - for event creation dropdown)
router.get('/organizers', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    
    const organizers = await db('users')
      .where('role', 'organizer')
      .where('is_active', true)
      .whereNull('deleted_at')
      .select('id', 'first_name', 'last_name', 'email', 'phone')
      .limit(Math.min(limit, 100))
      .offset(offset);

    res.json({
      success: true,
      data: organizers
    });
  } catch (error) {
    console.error('Get organizers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch organizers',
      error: error.message
    });
  }
});

// Get all users (Admin only)
router.get('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      role,
      status,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;

    const offset = (page - 1) * limit;

    let query = db('users')
      .whereNull('deleted_at')
      .select([
        'id', 'email', 'first_name', 'last_name', 'phone', 'role',
        'is_active', 'email_verified', 'phone_verified', 'last_login_at',
        'created_at', 'updated_at'
      ]);

    // Apply filters
    if (search) {
      query = query.where(function() {
        this.where('first_name', 'ilike', `%${search}%`)
          .orWhere('last_name', 'ilike', `%${search}%`)
          .orWhere('email', 'ilike', `%${search}%`);
      });
    }

    if (role) {
      query = query.where({ role });
    }

    if (status === 'active') {
      query = query.where({ is_active: true });
    } else if (status === 'inactive') {
      query = query.where({ is_active: false });
    }

    // Apply sorting
    query = query.orderBy(sort_by, sort_order);

    // Get total count for pagination
    const totalQuery = query.clone().clearSelect().clearOrder().count('* as count').first();
    const [totalResult] = await Promise.all([totalQuery]);

    // Apply pagination
    query = query.limit(limit).offset(offset);

    const [users, total] = await Promise.all([query, totalResult]);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.count),
          pages: Math.ceil(total.count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

// Get user by ID
router.get('/:id', verifyToken, requireOwnershipOrAdmin(), validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await db('users')
      .where({ id })
      .whereNull('deleted_at')
      .select([
        'id', 'email', 'first_name', 'last_name', 'phone', 'address',
        'city', 'state', 'country', 'postal_code', 'role', 'is_active',
        'email_verified', 'phone_verified', 'last_login_at', 'created_at',
        'updated_at'
      ])
      .first();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user'
    });
  }
});

// Update user (Admin or self)
router.put('/:id', verifyToken, requireOwnershipOrAdmin(), validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Prevent role changes - must use RBAC system instead
    if (updateData.role) {
      return res.status(403).json({
        success: false,
        message: 'Role assignments must be managed through the RBAC system. Use /api/rbac/users/:userId/roles instead.'
      });
    }

    // Prevent non-admin users from changing sensitive fields
    if (req.user.role !== 'admin') {
      delete updateData.is_active;
      delete updateData.email_verified;
      delete updateData.phone_verified;
    }

    // Remove fields that shouldn't be updated directly
    delete updateData.id;
    delete updateData.password_hash;
    delete updateData.created_at;
    delete updateData.deleted_at;

    updateData.updated_at = new Date();

    const [updatedUser] = await db('users')
      .where({ id })
      .whereNull('deleted_at')
      .update(updateData)
      .returning([
        'id', 'email', 'first_name', 'last_name', 'phone', 'address',
        'city', 'state', 'country', 'postal_code', 'role', 'is_active',
        'email_verified', 'phone_verified', 'updated_at'
      ]);

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Log audit event
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'USER_UPDATED',
      resource: 'users',
      resource_id: id,
      old_values: null, // You could store old values here
      new_values: JSON.stringify(updateData),
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
});

// Soft delete user (Admin only)
router.delete('/:id', verifyToken, requireRole('admin'), validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const [deletedUser] = await db('users')
      .where({ id })
      .update({
        deleted_at: new Date(),
        is_active: false
      })
      .returning(['id', 'email']);

    if (!deletedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Log audit event
    await db('audit_logs').insert({
      user_id: req.user.id,
      action: 'USER_DELETED',
      resource: 'users',
      resource_id: id,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
});

// Get user statistics (Admin only)
router.get('/stats/overview', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const stats = await db('users')
      .whereNull('deleted_at')
      .select(
        db.raw('COUNT(*) as total_users'),
        db.raw('COUNT(CASE WHEN role = \'customer\' THEN 1 END) as customers'),
        db.raw('COUNT(CASE WHEN role = \'organizer\' THEN 1 END) as organizers'),
        db.raw('COUNT(CASE WHEN role = \'venue_manager\' THEN 1 END) as venue_managers'),
        db.raw('COUNT(CASE WHEN role = \'admin\' THEN 1 END) as admins'),
        db.raw('COUNT(CASE WHEN is_active = true THEN 1 END) as active_users'),
        db.raw('COUNT(CASE WHEN email_verified = true THEN 1 END) as verified_users'),
        db.raw('COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL \'30 days\' THEN 1 END) as new_users_30_days')
      )
      .first();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user statistics'
    });
  }
});

// Get user's tickets (for customer dashboard)
router.get('/:id/tickets', verifyToken, requireOwnershipOrAdmin(), validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    const offset = (page - 1) * limit;

    let query = db('tickets')
      .join('events', 'tickets.event_id', 'events.id')
      .where('tickets.user_id', id)
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
    console.error('Get user tickets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user tickets'
    });
  }
});

// Get user's payments (for customer dashboard)
router.get('/:id/payments', verifyToken, requireOwnershipOrAdmin(), validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    const offset = (page - 1) * limit;

    let query = db('payments')
      .where('user_id', id)
      .whereNull('deleted_at')
      .select([
        'id', 'amount', 'currency', 'status', 'payment_method',
        'gateway', 'created_at', 'completed_at'
      ])
      .orderBy('created_at', 'desc');

    if (status) {
      query = query.where('status', status);
    }

    // Get total count
    const totalQuery = query.clone().clearSelect().clearOrder().count('* as count').first();
    const [payments, total] = await Promise.all([
      query.limit(limit).offset(offset),
      totalQuery
    ]);

    res.json({
      success: true,
      data: {
        payments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.count),
          pages: Math.ceil(total.count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get user payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user payments'
    });
  }
});

module.exports = router;
