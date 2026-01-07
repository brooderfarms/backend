const jwt = require('jsonwebtoken');
const db = require('../config/database');
const RBACService = require('../services/rbacService');

// Verify JWT token middleware
const verifyToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db('users')
      .where({ id: decoded.id, is_active: true })
      .whereNull('deleted_at')
      .first();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token is not valid. User not found.'
      });
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to security reasons.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({
      success: false,
      message: 'Token is not valid.'
    });
  }
};

// Role-based access control middleware
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    }

    next();
  };
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await db('users')
        .where({ id: decoded.id, is_active: true })
        .whereNull('deleted_at')
        .first();

      if (user) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Ignore token errors for optional auth
    next();
  }
};

// Check if user owns resource or is admin
const requireOwnershipOrAdmin = (resourceField = 'user_id') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    // Admin can access everything
    if (req.user.role === 'admin') {
      return next();
    }

    const resourceId = req.params.id || req.body[resourceField];
    if (req.user.id !== resourceId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only access your own resources.'
      });
    }

    next();
  };
};

// Check if user can manage event (organizer or admin)
const canManageEvent = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    // Admin can manage all events
    if (req.user.role === 'admin') {
      return next();
    }

    const eventId = req.params.id || req.body.event_id;
    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: 'Event ID is required.'
      });
    }

    const event = await db('events')
      .where({ id: eventId })
      .whereNull('deleted_at')
      .first();

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found.'
      });
    }

    // Organizer can manage their own events
    if (req.user.role === 'organizer' && event.organizer_id === req.user.id) {
      return next();
    }

    // Venue manager can manage events at their venues
    if (req.user.role === 'venue_manager') {
      const venue = await db('venues')
        .where({ id: event.venue_id, manager_id: req.user.id })
        .first();

      if (venue) {
        return next();
      }
    }

    return res.status(403).json({
      success: false,
      message: 'Access denied. You cannot manage this event.'
    });
  } catch (error) {
    console.error('Event management check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during authorization check.'
    });
  }
};

// Permission-based access control middleware
const requirePermission = (permissionName, options = {}) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.'
        });
      }

      // Admin has all permissions
      if (req.user.role === 'admin') {
        return next();
      }

      // Check if user has the required permission
      const hasPermission = await RBACService.hasPermission(
        req.user.id,
        permissionName,
        options.scope
      );

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Permission required: ${permissionName}`
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error during authorization check.'
      });
    }
  };
};

// Check multiple permissions (OR logic)
const requireAnyPermission = (permissionNames, options = {}) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.'
        });
      }

      // Admin has all permissions
      if (req.user.role === 'admin') {
        return next();
      }

      const userPermissions = await RBACService.getUserPermissions(
        req.user.id,
        options.scope
      );
      const userPermissionNames = userPermissions.map(p => p.name);

      const hasAnyPermission = permissionNames.some(name => userPermissionNames.includes(name));

      if (!hasAnyPermission) {
        return res.status(403).json({
          success: false,
          message: `Access denied. One of these permissions required: ${permissionNames.join(', ')}`
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error during authorization check.'
      });
    }
  };
};

// Check multiple permissions (AND logic)
const requireAllPermissions = (permissionNames, options = {}) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.'
        });
      }

      // Admin has all permissions
      if (req.user.role === 'admin') {
        return next();
      }

      const userPermissions = await RBACService.getUserPermissions(
        req.user.id,
        options.scope
      );
      const userPermissionNames = userPermissions.map(p => p.name);

      const hasAllPermissions = permissionNames.every(name => userPermissionNames.includes(name));

      if (!hasAllPermissions) {
        return res.status(403).json({
          success: false,
          message: `Access denied. All of these permissions required: ${permissionNames.join(', ')}`
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error during authorization check.'
      });
    }
  };
};

module.exports = {
  verifyToken,
  requireRole,
  optionalAuth,
  requireOwnershipOrAdmin,
  canManageEvent,
  requirePermission,
  requireAnyPermission,
  requireAllPermissions
};
