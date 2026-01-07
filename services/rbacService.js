const db = require('../config/database');
const { randomUUID } = require('crypto');

/**
 * RBAC Service - Manages roles, permissions, and authorization
 */
class RBACService {
  /**
   * Get all permissions
   */
  static async getAllPermissions(filters = {}) {
    let query = db('permissions').whereNull('deleted_at');

    if (filters.category) {
      query = query.where('category', filters.category);
    }

    if (filters.search) {
      query = query.where(function() {
        this.where('name', 'like', `%${filters.search}%`)
          .orWhere('description', 'like', `%${filters.search}%`);
      });
    }

    return await query.orderBy('category').orderBy('name');
  }

  /**
   * Create a new permission
   */
  static async createPermission(data) {
    const { name, description, category, is_system = false } = data;

    const [id] = await db('permissions').insert({
      name,
      description,
      category,
      is_system,
      created_at: new Date(),
      updated_at: new Date()
    });

    return this.getPermissionById(id);
  }

  /**
   * Get permission by ID
   */
  static async getPermissionById(id) {
    return await db('permissions')
      .where('id', id)
      .whereNull('deleted_at')
      .first();
  }

  /**
   * Delete permission (soft-delete)
   */
  static async deletePermission(id) {
    const permission = await this.getPermissionById(id);
    if (!permission) throw new Error('Permission not found');
    if (permission.is_system) throw new Error('Cannot delete system permissions');

    return await db('permissions')
      .where('id', id)
      .update({
        deleted_at: new Date(),
        updated_at: new Date()
      });
  }

  /**
   * Get all roles
   */
  static async getAllRoles(filters = {}) {
    let query = db('roles').whereNull('deleted_at');

    if (filters.is_system !== undefined) {
      query = query.where('is_system', filters.is_system);
    }

    if (filters.search) {
      query = query.where('name', 'like', `%${filters.search}%`);
    }

    return await query.orderBy('priority', 'desc').orderBy('name');
  }

  /**
   * Get role by ID with permissions
   */
  static async getRoleById(id) {
    const role = await db('roles')
      .where('id', id)
      .whereNull('deleted_at')
      .first();

    if (!role) return null;

    role.permissions = await db('role_permissions')
      .join('permissions', 'role_permissions.permission_id', '=', 'permissions.id')
      .where('role_permissions.role_id', id)
      .select('permissions.*');

    return role;
  }

  /**
   * Create a new role
   */
  static async createRole(data) {
    const { name, description, priority = 0, is_system = false, permissions = [] } = data;

    const [id] = await db('roles').insert({
      name,
      description,
      priority,
      is_system,
      created_at: new Date(),
      updated_at: new Date()
    });

    if (permissions.length > 0) {
      await this.assignPermissionsToRole(id, permissions);
    }

    return this.getRoleById(id);
  }

  /**
   * Update role
   */
  static async updateRole(id, data) {
    const role = await this.getRoleById(id);
    if (!role) throw new Error('Role not found');
    if (role.is_system) throw new Error('Cannot modify system roles');

    const { name, description, priority, permissions } = data;

    await db('roles').where('id', id).update({
      ...(name && { name }),
      ...(description && { description }),
      ...(priority !== undefined && { priority }),
      updated_at: new Date()
    });

    if (permissions) {
      // Clear existing permissions
      await db('role_permissions').where('role_id', id).delete();
      // Assign new permissions
      if (permissions.length > 0) {
        await this.assignPermissionsToRole(id, permissions);
      }
    }

    return this.getRoleById(id);
  }

  /**
   * Assign permissions to a role
   */
  static async assignPermissionsToRole(roleId, permissionIds) {
    const records = permissionIds.map(permissionId => ({
      id: require('crypto').randomUUID(),
      role_id: roleId,
      permission_id: permissionId,
      created_at: new Date(),
      updated_at: new Date()
    }));

    return await db('role_permissions').insert(records);
  }

  /**
   * Get user's effective roles (considering expiration and scope)
   */
  static async getUserRoles(userId, scope = null) {
    let query = db('user_roles')
      .join('roles', 'user_roles.role_id', '=', 'roles.id')
      .where('user_roles.user_id', userId)
      .whereNull('user_roles.deleted_at')
      .where(function() {
        this.whereNull('user_roles.expires_at')
          .orWhere('user_roles.expires_at', '>', new Date());
      });

    if (scope) {
      query = query.where(function() {
        this.whereNull('user_roles.scope')
          .orWhere('user_roles.scope', scope);
      });
    }

    return await query.select('roles.*', 'user_roles.scope', 'user_roles.expires_at');
  }

  /**
   * Get user's effective permissions
   */
  static async getUserPermissions(userId, scope = null) {
    const userRoles = await this.getUserRoles(userId, scope);
    const roleIds = userRoles.map(r => r.id);

    if (roleIds.length === 0) return [];

    return await db('role_permissions')
      .join('permissions', 'role_permissions.permission_id', '=', 'permissions.id')
      .whereIn('role_permissions.role_id', roleIds)
      .whereNull('permissions.deleted_at')
      .distinct('permissions.*');
  }

  /**
   * Check if user has specific permission
   */
  static async hasPermission(userId, permissionName, scope = null) {
    const permissions = await this.getUserPermissions(userId, scope);
    return permissions.some(p => p.name === permissionName);
  }

  /**
   * Assign role to user
   */
  static async assignRoleToUser(userId, roleId, data = {}) {
    try {
      const { scope = null, expires_at = null, granted_by = null, reason = '' } = data;

      // Validate that user and role exist
      const user = await db('users').where('id', userId).first();
      if (!user) throw new Error('User not found');

      const role = await db('roles').where('id', roleId).first();
      if (!role) throw new Error('Role not found');

      // Convert expires_at to proper date if it's a string
      let expiresAtDate = null;
      if (expires_at) {
        expiresAtDate = typeof expires_at === 'string' ? new Date(expires_at) : expires_at;
      }

      // Create the insert data object (without id - let database generate it)
      const insertData = {
        user_id: userId,
        role_id: roleId
      };

      // Only add optional fields if provided
      if (scope) insertData.scope = scope;
      if (expiresAtDate) insertData.expires_at = expiresAtDate;
      if (granted_by) insertData.granted_by = granted_by;
      if (reason) insertData.reason = reason;

      console.log('Inserting user role:', insertData);

      const result = await db('user_roles').insert(insertData).returning('*');

      return result[0] || result;
    } catch (error) {
      console.error('assignRoleToUser error:', error);
      throw error;
    }
  }

  /**
   * Remove role from user
   */
  static async removeRoleFromUser(userId, roleId, scope = null) {
    let query = db('user_roles')
      .where('user_id', userId)
      .where('role_id', roleId);

    if (scope) {
      query = query.where('scope', scope);
    }

    return await query.update({
      deleted_at: new Date(),
      updated_at: new Date()
    });
  }

  /**
   * Get user's effective role (primary role considering priority)
   * Returns the highest priority active role
   */
  static async getUserEffectiveRole(userId) {
    const userRoles = await this.getUserRoles(userId);
    if (userRoles.length === 0) return null;
    
    // Sort by priority descending and return the first (highest priority)
    return userRoles.sort((a, b) => b.priority - a.priority)[0];
  }

  /**
   * Initialize default RBAC structure with system roles and permissions
   */
  static async initializeSystemRBAC() {
    // Define system permissions
    const systemPermissions = [
      // User management
      { name: 'users.view', category: 'users', description: 'View users' },
      { name: 'users.create', category: 'users', description: 'Create users' },
      { name: 'users.edit', category: 'users', description: 'Edit users' },
      { name: 'users.delete', category: 'users', description: 'Delete users' },
      { name: 'users.manage-roles', category: 'users', description: 'Manage user roles' },

      // Event management
      { name: 'events.view', category: 'events', description: 'View events' },
      { name: 'events.create', category: 'events', description: 'Create events' },
      { name: 'events.edit', category: 'events', description: 'Edit events' },
      { name: 'events.delete', category: 'events', description: 'Delete events' },
      { name: 'events.publish', category: 'events', description: 'Publish events' },
      { name: 'events.manage-streaming', category: 'events', description: 'Manage event streaming' },

      // Venue management
      { name: 'venues.view', category: 'venues', description: 'View venues' },
      { name: 'venues.create', category: 'venues', description: 'Create venues' },
      { name: 'venues.edit', category: 'venues', description: 'Edit venues' },
      { name: 'venues.delete', category: 'venues', description: 'Delete venues' },

      // Ticket management
      { name: 'tickets.view', category: 'tickets', description: 'View tickets' },
      { name: 'tickets.create', category: 'tickets', description: 'Create tickets' },
      { name: 'tickets.edit', category: 'tickets', description: 'Edit tickets' },
      { name: 'tickets.delete', category: 'tickets', description: 'Delete tickets' },
      { name: 'tickets.transfer', category: 'tickets', description: 'Transfer tickets' },
      { name: 'tickets.refund', category: 'tickets', description: 'Refund tickets' },

      // Payment management
      { name: 'payments.view', category: 'payments', description: 'View payments' },
      { name: 'payments.process', category: 'payments', description: 'Process payments' },
      { name: 'payments.refund', category: 'payments', description: 'Refund payments' },

      // Reporting
      { name: 'reports.view', category: 'reports', description: 'View reports' },
      { name: 'reports.export', category: 'reports', description: 'Export reports' },

      // Settings
      { name: 'settings.view', category: 'settings', description: 'View settings' },
      { name: 'settings.edit', category: 'settings', description: 'Edit settings' },

      // Audit
      { name: 'audit.view', category: 'audit', description: 'View audit logs' },
      { name: 'audit.export', category: 'audit', description: 'Export audit logs' },

      // System
      { name: 'system.admin', category: 'system', description: 'Full system admin access' }
    ];

    // Create permissions if they don't exist
    for (const perm of systemPermissions) {
      const exists = await db('permissions')
        .where('name', perm.name)
        .whereNull('deleted_at')
        .first();

      if (!exists) {
        await db('permissions').insert({
          id: require('crypto').randomUUID(),
          ...perm,
          is_system: true,
          created_at: new Date(),
          updated_at: new Date()
        });
      }
    }

    // Define system roles with their permissions
    const systemRoles = [
      {
        name: 'admin',
        description: 'Full system administrator access',
        priority: 100,
        permissions: ['system.admin'] // Wildcard: admin has all permissions
      },
      {
        name: 'organizer',
        description: 'Event organizer - can create and manage events',
        priority: 50,
        permissions: [
          'events.create', 'events.edit', 'events.delete', 'events.publish',
          'events.manage-streaming', 'tickets.view', 'tickets.create',
          'payments.view', 'reports.view', 'audit.view'
        ]
      },
      {
        name: 'venue_manager',
        description: 'Venue manager - can manage venue and associated events',
        priority: 40,
        permissions: [
          'venues.view', 'venues.edit', 'events.view', 'events.edit',
          'tickets.view', 'payments.view', 'reports.view', 'audit.view'
        ]
      },
      {
        name: 'vendor',
        description: 'Vendor - can manage merchandise and products',
        priority: 30,
        permissions: ['payments.view', 'reports.view']
      },
      {
        name: 'customer',
        description: 'Regular customer - can view events and purchase tickets',
        priority: 10,
        permissions: ['events.view', 'tickets.view', 'payments.view']
      }
    ];

    // Create roles and assign permissions
    for (const roleData of systemRoles) {
      const existingRole = await db('roles')
        .where('name', roleData.name)
        .whereNull('deleted_at')
        .first();

      if (!existingRole) {
        const roleId = require('crypto').randomUUID();
        await db('roles').insert({
          id: roleId,
          name: roleData.name,
          description: roleData.description,
          priority: roleData.priority,
          is_system: true,
          created_at: new Date(),
          updated_at: new Date()
        });

        // Assign permissions
        if (roleData.permissions.length > 0) {
          const permissionIds = await db('permissions')
            .whereIn('name', roleData.permissions)
            .whereNull('deleted_at')
            .pluck('id');

          if (permissionIds.length > 0) {
            const records = permissionIds.map(permissionId => ({
              id: require('crypto').randomUUID(),
              role_id: roleId,
              permission_id: permissionId,
              created_at: new Date(),
              updated_at: new Date()
            }));
            await db('role_permissions').insert(records);
          }
        }
      }
    }
  }
}

module.exports = RBACService;
