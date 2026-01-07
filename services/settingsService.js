/**
 * Settings Service
 * Manages system-wide configuration for commission, VAT, taxes, and other settings
 */

const db = require('../config/database');

class SettingsService {
  /**
   * Get a single setting by key
   */
  static async getSetting(key) {
    try {
      const setting = await db('settings')
        .where({ key })
        .first();

      if (!setting) {
        return null;
      }

      return {
        ...setting,
        value: this.parseValue(setting.value, setting.type)
      };
    } catch (error) {
      console.error('Error fetching setting:', error);
      throw error;
    }
  }

  /**
   * Get all settings
   */
  static async getAllSettings() {
    try {
      const settings = await db('settings').orderBy('key');

      return settings.map(setting => ({
        ...setting,
        value: this.parseValue(setting.value, setting.type)
      }));
    } catch (error) {
      console.error('Error fetching all settings:', error);
      throw error;
    }
  }

  /**
   * Get settings grouped by category
   */
  static async getSettingsByCategory() {
    try {
      const settings = await db('settings').orderBy('key');

      const grouped = {
        commission: [],
        taxes: [],
        fees: [],
        other: []
      };

      settings.forEach(setting => {
        const parsed = {
          ...setting,
          value: this.parseValue(setting.value, setting.type)
        };

        if (setting.key.includes('commission')) {
          grouped.commission.push(parsed);
        } else if (setting.key.includes('vat') || setting.key.includes('tax')) {
          grouped.taxes.push(parsed);
        } else if (setting.key.includes('fee')) {
          grouped.fees.push(parsed);
        } else {
          grouped.other.push(parsed);
        }
      });

      return grouped;
    } catch (error) {
      console.error('Error fetching settings by category:', error);
      throw error;
    }
  }

  /**
   * Update or create a setting
   */
  static async updateSetting(key, value, userId, type = 'percentage', description = null) {
    try {
      const existing = await db('settings').where({ key }).first();

      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

      if (existing) {
        await db('settings')
          .where({ key })
          .update({
            value: stringValue,
            type,
            description: description || existing.description,
            updated_by: userId,
            updated_at: db.fn.now()
          });
      } else {
        await db('settings').insert({
          key,
          value: stringValue,
          type,
          description,
          updated_by: userId,
          created_at: db.fn.now(),
          updated_at: db.fn.now()
        });
      }

      return this.getSetting(key);
    } catch (error) {
      console.error('Error updating setting:', error);
      throw error;
    }
  }

  /**
   * Bulk update settings
   */
  static async bulkUpdateSettings(settingsArray, userId) {
    try {
      const results = [];

      for (const setting of settingsArray) {
        const result = await this.updateSetting(
          setting.key,
          setting.value,
          userId,
          setting.type || 'percentage',
          setting.description || null
        );
        results.push(result);
      }

      return results;
    } catch (error) {
      console.error('Error bulk updating settings:', error);
      throw error;
    }
  }

  /**
   * Get commission rate (used in payment service)
   */
  static async getCommissionRate(organizerId = null) {
    try {
      // If organizerId provided, check for user-specific rate first
      if (organizerId) {
        const userCommission = await db('users')
          .where({ id: organizerId })
          .select('commission_percentage')
          .first();

        if (userCommission && userCommission.commission_percentage) {
          return userCommission.commission_percentage;
        }
      }

      // Fall back to default commission setting
      const setting = await this.getSetting('default_commission_rate');
      return setting ? setting.value : 5; // Default 5% if not set
    } catch (error) {
      console.error('Error fetching commission rate:', error);
      return 5; // Default fallback
    }
  }

  /**
   * Get VAT rate
   */
  static async getVATRate() {
    try {
      const setting = await this.getSetting('vat_rate');
      return setting ? setting.value : 0;
    } catch (error) {
      console.error('Error fetching VAT rate:', error);
      return 0;
    }
  }

  /**
   * Get all tax rates
   */
  static async getAllTaxRates() {
    try {
      const settings = await db('settings')
        .where('key', 'like', '%tax%')
        .orWhere('key', 'like', '%vat%');

      return settings.reduce((acc, setting) => {
        acc[setting.key] = this.parseValue(setting.value, setting.type);
        return acc;
      }, {});
    } catch (error) {
      console.error('Error fetching tax rates:', error);
      throw error;
    }
  }

  /**
   * Calculate total commission and taxes on an amount
   */
  static async calculateFees(amount, organizerId = null) {
    try {
      const commissionRate = await this.getCommissionRate(organizerId);
      const vatRate = await this.getVATRate();

      const commission = (amount * commissionRate) / 100;
      const vat = (amount * vatRate) / 100;
      const totalFees = commission + vat;
      const netAmount = amount - totalFees;

      return {
        grossAmount: amount,
        commissionRate,
        commission,
        vatRate,
        vat,
        totalFees,
        netAmount
      };
    } catch (error) {
      console.error('Error calculating fees:', error);
      throw error;
    }
  }

  /**
   * Parse value based on type
   */
  static parseValue(value, type) {
    if (type === 'json') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } else if (type === 'percentage' || type === 'fixed') {
      return parseFloat(value);
    }
    return value;
  }

  /**
   * Delete a setting
   */
  static async deleteSetting(key) {
    try {
      await db('settings').where({ key }).delete();
      return true;
    } catch (error) {
      console.error('Error deleting setting:', error);
      throw error;
    }
  }
}

module.exports = SettingsService;
