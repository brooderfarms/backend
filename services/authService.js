const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class AuthService {
  // Hash password
  async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  // Verify password
  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  // Generate JWT token
  generateToken(user) {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      approval_status: user.approval_status,
      payment_verification_status: user.payment_verification_status,
      iat: Math.floor(Date.now() / 1000)
    };

    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE || '7d'
    });
  }

  // Generate refresh token
  generateRefreshToken(user) {
    const payload = {
      id: user.id,
      type: 'refresh'
    };

    return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRE || '30d'
    });
  }

  // Verify refresh token
  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  // Generate verification token
  generateVerificationToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Generate password reset token
  generatePasswordResetToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Register new user
  async register(userData) {
    const { email, password, first_name, last_name, phone, role = 'customer' } = userData;

    // Check if user already exists
    const existingUser = await db('users')
      .where({ email })
      .whereNull('deleted_at')
      .first();

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Verify role exists in roles table
    const roleRecord = await db('roles')
      .where({ name: role })
      .whereNull('deleted_at')
      .first();

    if (!roleRecord) {
      throw new Error(`Role '${role}' does not exist. Please select a valid role.`);
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Generate verification token
    const verificationToken = this.generateVerificationToken();

    // Create user
    const [user] = await db('users')
      .insert({
        email,
        password_hash: passwordHash,
        first_name,
        last_name,
        phone,
        role,
        email_verified: false,
        is_active: true,
        verification_token: verificationToken
      })
      .returning(['id', 'email', 'first_name', 'last_name', 'role', 'email_verified', 'created_at']);

    // Also assign role in RBAC system
    try {
      await db('user_roles').insert({
        user_id: user.id,
        role_id: roleRecord.id
      });
    } catch (error) {
      console.error('Error assigning default role to user:', error);
      // Non-fatal - user created but RBAC assignment failed
    }

    // Log audit event
    await this.logAuditEvent(user.id, 'USER_REGISTERED', 'users', user.id, null, user);

    return {
      user,
      verificationToken
    };
  }

  // Login user
  async login(email, password) {
    // Find user
    const user = await db('users')
      .where({ email, is_active: true })
      .whereNull('deleted_at')
      .first();

    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new Error('Account is temporarily locked due to too many failed login attempts');
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      // Increment login attempts
      await this.handleFailedLogin(user.id);
      throw new Error('Invalid email or password');
    }

    // Reset login attempts on successful login
    await db('users')
      .where({ id: user.id })
      .update({
        login_attempts: 0,
        locked_until: null,
        last_login_at: new Date()
      });

    // Fetch user roles from RBAC system
    const userRoles = await db('user_roles')
      .select('roles.id', 'roles.name', 'roles.description', 'user_roles.scope', 'user_roles.expires_at')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .where('user_roles.user_id', user.id)
      .whereNull('user_roles.deleted_at')
      .whereNull('roles.deleted_at');

    // Generate tokens
    const token = this.generateToken(user);
    const refreshToken = this.generateRefreshToken(user);

    // Log audit event
    await this.logAuditEvent(user.id, 'USER_LOGIN', 'users', user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        roles: userRoles, // RBAC roles
        approval_status: user.approval_status,
        payment_verification_status: user.payment_verification_status,
        email_verified: user.email_verified,
        phone_verified: user.phone_verified
      },
      token,
      refreshToken
    };
  }

  // Handle failed login attempts
  async handleFailedLogin(userId) {
    const maxAttempts = 5;
    const lockoutDuration = 30 * 60 * 1000; // 30 minutes

    const user = await db('users')
      .where({ id: userId })
      .first();

    const newAttempts = (user.login_attempts || 0) + 1;

    let updateData = { login_attempts: newAttempts };

    if (newAttempts >= maxAttempts) {
      updateData.locked_until = new Date(Date.now() + lockoutDuration);
    }

    await db('users')
      .where({ id: userId })
      .update(updateData);

    // Log suspicious activity
    if (newAttempts >= maxAttempts) {
      await this.logAuditEvent(userId, 'ACCOUNT_LOCKED', 'users', userId, null, {
        reason: 'Too many failed login attempts',
        attempts: newAttempts
      });
    }
  }

  // Verify email
  async verifyEmail(token) {
    const user = await db('users')
      .where({ verification_token: token, email_verified: false })
      .whereNull('deleted_at')
      .first();

    if (!user) {
      throw new Error('Invalid or expired verification token');
    }

    await db('users')
      .where({ id: user.id })
      .update({
        email_verified: true,
        email_verified_at: new Date(),
        verification_token: null
      });

    // Log audit event
    await this.logAuditEvent(user.id, 'EMAIL_VERIFIED', 'users', user.id);

    return { message: 'Email verified successfully' };
  }

  // Request password reset
  async requestPasswordReset(email) {
    const user = await db('users')
      .where({ email, is_active: true })
      .whereNull('deleted_at')
      .first();

    if (!user) {
      // Don't reveal if email exists or not for security
      return { message: 'If the email exists, a password reset link has been sent' };
    }

    const resetToken = this.generatePasswordResetToken();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db('users')
      .where({ id: user.id })
      .update({
        password_reset_token: resetToken,
        password_reset_expires: resetExpires
      });

    // Log audit event
    await this.logAuditEvent(user.id, 'PASSWORD_RESET_REQUESTED', 'users', user.id);

    // Here you would send the email with the reset token
    // For now, we'll just return the token for testing purposes
    return {
      message: 'Password reset link sent to your email',
      resetToken // Remove this in production
    };
  }

  // Reset password
  async resetPassword(token, newPassword) {
    const user = await db('users')
      .where({
        password_reset_token: token,
        is_active: true
      })
      .where('password_reset_expires', '>', new Date())
      .whereNull('deleted_at')
      .first();

    if (!user) {
      throw new Error('Invalid or expired reset token');
    }

    const passwordHash = await this.hashPassword(newPassword);

    await db('users')
      .where({ id: user.id })
      .update({
        password_hash: passwordHash,
        password_reset_token: null,
        password_reset_expires: null,
        login_attempts: 0,
        locked_until: null
      });

    // Log audit event
    await this.logAuditEvent(user.id, 'PASSWORD_RESET', 'users', user.id);

    return { message: 'Password reset successfully' };
  }

  // Change password
  async changePassword(userId, currentPassword, newPassword) {
    const user = await db('users')
      .where({ id: userId, is_active: true })
      .whereNull('deleted_at')
      .first();

    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValidPassword = await this.verifyPassword(currentPassword, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }

    const passwordHash = await this.hashPassword(newPassword);

    await db('users')
      .where({ id: userId })
      .update({
        password_hash: passwordHash,
        login_attempts: 0,
        locked_until: null
      });

    // Log audit event
    await this.logAuditEvent(userId, 'PASSWORD_CHANGED', 'users', userId);

    return { message: 'Password changed successfully' };
  }

  // Refresh token
  async refreshToken(refreshToken) {
    try {
      const decoded = this.verifyRefreshToken(refreshToken);

      const user = await db('users')
        .where({ id: decoded.id, is_active: true })
        .whereNull('deleted_at')
        .first();

      if (!user) {
        throw new Error('User not found');
      }

      const newToken = this.generateToken(user);
      const newRefreshToken = this.generateRefreshToken(user);

      return {
        token: newToken,
        refreshToken: newRefreshToken
      };
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  // Log audit event
  async logAuditEvent(userId, action, resource, resourceId, oldValues = null, newValues = null, metadata = null) {
    try {
      await db('audit_logs').insert({
        user_id: userId,
        action,
        resource,
        resource_id: resourceId,
        old_values: oldValues ? JSON.stringify(oldValues) : null,
        new_values: newValues ? JSON.stringify(newValues) : null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Failed to log audit event:', error);
      // Don't throw error to avoid breaking main functionality
    }
  }

  // Get user by ID
  async getUserById(id) {
    return await db('users')
      .where({ id, is_active: true })
      .whereNull('deleted_at')
      .select([
        'id', 'email', 'first_name', 'last_name', 'phone', 'address',
        'city', 'state', 'country', 'postal_code', 'role', 'is_active',
        'email_verified', 'phone_verified', 'last_login_at', 'created_at',
        'approval_status', 'rejection_reason', 'commission_percentage',
        'payment_verification_status'
      ])
      .first();
  }

  // Update user profile
  async updateProfile(userId, updateData) {
    const allowedFields = [
      'first_name', 'last_name', 'phone', 'address', 'city',
      'state', 'country', 'postal_code', 'profile_image_url', 'preferences'
    ];

    const filteredData = {};
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        filteredData[key] = updateData[key];
      }
    });

    if (Object.keys(filteredData).length === 0) {
      throw new Error('No valid fields to update');
    }

    filteredData.updated_at = new Date();

    const [updatedUser] = await db('users')
      .where({ id: userId, is_active: true })
      .whereNull('deleted_at')
      .update(filteredData)
      .returning([
        'id', 'email', 'first_name', 'last_name', 'phone', 'address',
        'city', 'state', 'country', 'postal_code', 'role', 'is_active',
        'email_verified', 'phone_verified', 'updated_at'
      ]);

    if (!updatedUser) {
      throw new Error('User not found');
    }

    // Log audit event
    await this.logAuditEvent(userId, 'PROFILE_UPDATED', 'users', userId, null, filteredData);

    return updatedUser;
  }
}

module.exports = new AuthService();
