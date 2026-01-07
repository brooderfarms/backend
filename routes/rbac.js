const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireRole, requirePermission } = require('../middleware/auth');
const RBACService = require('../services/rbacService');

/**
 * ==================== PUBLIC ENDPOINTS ====================
 */

// GET /api/rbac/public/roles - List all active roles (public endpoint for registration)
router.get('/public/roles', async (req, res) => {
  try {
    console.log('Fetching public roles...');
    const roles = await db('roles')
      .select('id', 'name', 'description')
      .whereNull('deleted_at')
      .orderBy('name');

    console.log('Found roles:', roles);

    res.json({
      success: true,
      data: roles
    });
  } catch (error) {
    console.error('Get public roles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch roles',
      error: error.message
    });
  }
});

// All remaining RBAC routes require authentication and admin role
router.use(verifyToken);
router.use(requireRole('admin'));

/**
 * ==================== PERMISSIONS ====================
 */

// GET /api/rbac/permissions - List all permissions
router.get('/permissions', async (req, res) => {
  try {
    const { category, search } = req.query;
    const filters = {};
    if (category) filters.category = category;
    if (search) filters.search = search;

    const permissions = await RBACService.getAllPermissions(filters);

    res.json({
      success: true,
      data: permissions,
      total: permissions.length
    });
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch permissions',
      error: error.message
    });
  }
});

// POST /api/rbac/permissions - Create new permission
router.post('/permissions', async (req, res) => {
  try {
    const { name, description, category } = req.body;

    if (!name || !category) {
      return res.status(400).json({
        success: false,
        message: 'Name and category are required'
      });
    }

    const permission = await RBACService.createPermission({
      name,
      description,
      category
    });

    res.status(201).json({
      success: true,
      data: permission,
      message: 'Permission created successfully'
    });
  } catch (error) {
    console.error('Create permission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create permission',
      error: error.message
    });
  }
});

// GET /api/rbac/permissions/:id - Get permission by ID
router.get('/permissions/:id', async (req, res) => {
  try {
    const permission = await RBACService.getPermissionById(req.params.id);

    if (!permission) {
      return res.status(404).json({
        success: false,
        message: 'Permission not found'
      });
    }

    res.json({
      success: true,
      data: permission
    });
  } catch (error) {
    console.error('Get permission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch permission',
      error: error.message
    });
  }
});

// DELETE /api/rbac/permissions/:id - Delete permission (soft-delete)
router.delete('/permissions/:id', async (req, res) => {
  try {
    await RBACService.deletePermission(req.params.id);

    res.json({
      success: true,
      message: 'Permission deleted successfully'
    });
  } catch (error) {
    console.error('Delete permission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete permission',
      error: error.message
    });
  }
});

/**
 * ==================== ROLES ====================
 */

// GET /api/rbac/roles - List all roles
router.get('/roles', async (req, res) => {
  try {
    const { search } = req.query;
    const filters = {};
    if (search) filters.search = search;

    const roles = await RBACService.getAllRoles(filters);

    res.json({
      success: true,
      data: roles,
      total: roles.length
    });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch roles',
      error: error.message
    });
  }
});

// POST /api/rbac/roles - Create new role
router.post('/roles', async (req, res) => {
  try {
    const { name, description, priority = 0, permissions = [] } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Role name is required'
      });
    }

    const role = await RBACService.createRole({
      name,
      description,
      priority,
      permissions
    });

    res.status(201).json({
      success: true,
      data: role,
      message: 'Role created successfully'
    });
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create role',
      error: error.message
    });
  }
});

// GET /api/rbac/roles/:id - Get role by ID with permissions
router.get('/roles/:id', async (req, res) => {
  try {
    const role = await RBACService.getRoleById(req.params.id);

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    res.json({
      success: true,
      data: role
    });
  } catch (error) {
    console.error('Get role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch role',
      error: error.message
    });
  }
});

// PUT /api/rbac/roles/:id - Update role
router.put('/roles/:id', async (req, res) => {
  try {
    const { name, description, priority, permissions } = req.body;

    const role = await RBACService.updateRole(req.params.id, {
      name,
      description,
      priority,
      permissions
    });

    res.json({
      success: true,
      data: role,
      message: 'Role updated successfully'
    });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update role',
      error: error.message
    });
  }
});

/**
 * ==================== USER ROLES ====================
 */

// GET /api/rbac/users/:userId/roles - Get user's roles
router.get('/users/:userId/roles', async (req, res) => {
  try {
    const roles = await RBACService.getUserRoles(req.params.userId);

    res.json({
      success: true,
      data: roles,
      total: roles.length
    });
  } catch (error) {
    console.error('Get user roles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user roles',
      error: error.message
    });
  }
});

// GET /api/rbac/users/:userId/permissions - Get user's permissions
router.get('/users/:userId/permissions', async (req, res) => {
  try {
    const { scope } = req.query;
    const permissions = await RBACService.getUserPermissions(req.params.userId, scope);

    res.json({
      success: true,
      data: permissions,
      total: permissions.length
    });
  } catch (error) {
    console.error('Get user permissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user permissions',
      error: error.message
    });
  }
});

// POST /api/rbac/users/:userId/roles - Assign role to user
router.post('/users/:userId/roles', async (req, res) => {
  try {
    const { roleId, scope, expires_at, reason } = req.body;

    if (!roleId) {
      return res.status(400).json({
        success: false,
        message: 'Role ID is required'
      });
    }

    console.log('Assigning role:', { userId: req.params.userId, roleId, scope, expires_at, reason });

    const userRole = await RBACService.assignRoleToUser(req.params.userId, roleId, {
      scope: scope || null,
      expires_at: expires_at || null,
      granted_by: req.user.id,
      reason: reason || ''
    });

    res.status(201).json({
      success: true,
      data: userRole,
      message: 'Role assigned to user successfully'
    });
  } catch (error) {
    console.error('Assign role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign role',
      error: error.message,
      details: error.stack
    });
  }
});

// DELETE /api/rbac/users/:userId/roles/:roleId - Remove role from user
router.delete('/users/:userId/roles/:roleId', async (req, res) => {
  try {
    const { scope } = req.query;

    await RBACService.removeRoleFromUser(req.params.userId, req.params.roleId, scope);

    res.json({
      success: true,
      message: 'Role removed from user successfully'
    });
  } catch (error) {
    console.error('Remove role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove role',
      error: error.message
    });
  }
});

/**
 * ==================== INITIALIZATION ====================
 */

// POST /api/rbac/initialize - Initialize default RBAC structure
router.post('/initialize', async (req, res) => {
  try {
    await RBACService.initializeSystemRBAC();

    res.json({
      success: true,
      message: 'RBAC system initialized with default roles and permissions'
    });
  } catch (error) {
    console.error('Initialize RBAC error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize RBAC',
      error: error.message
    });
  }
});

/**
 * ==================== AUDIT & REPORTING ====================
 */

// GET /api/rbac/report/permissions-by-role - Report permissions by role
router.get('/report/permissions-by-role', async (req, res) => {
  try {
    const roles = await RBACService.getAllRoles({ is_system: false });
    const report = {};

    for (const role of roles) {
      const roleWithPerms = await RBACService.getRoleById(role.id);
      report[role.name] = roleWithPerms.permissions.map(p => p.name);
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Permissions report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate report',
      error: error.message
    });
  }
});

// GET /api/rbac/report/user-roles - Report user role assignments
router.get('/report/user-roles', async (req, res) => {
  try {
    const userRoles = await db('user_roles')
      .join('users', 'user_roles.user_id', '=', 'users.id')
      .join('roles', 'user_roles.role_id', '=', 'roles.id')
      .whereNull('user_roles.deleted_at')
      .select(
        'users.id as user_id',
        'users.email',
        'users.first_name',
        'users.last_name',
        'roles.name as role_name',
        'user_roles.scope',
        'user_roles.expires_at',
        'user_roles.created_at'
      )
      .orderBy('users.email')
      .orderBy('roles.name');

    res.json({
      success: true,
      data: userRoles,
      total: userRoles.length
    });
  } catch (error) {
    console.error('User roles report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate report',
      error: error.message
    });
  }
});

module.exports = router;
