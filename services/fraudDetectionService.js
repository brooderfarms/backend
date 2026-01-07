const db = require('../config/database');
const auditService = require('./auditService');
const { v4: uuidv4 } = require('uuid');

class FraudDetectionService {
  /**
   * Analyze transaction for fraud indicators
   */
  async analyzeTransaction(transactionData, user) {
    try {
      const fraudFlags = [];
      const fraudScore = await this.calculateFraudScore(transactionData, user, fraudFlags);

      const isSuspicious = fraudScore > 70; // Threshold: 70% suspicion score

      return {
        isSuspicious,
        fraudScore,
        flags: fraudFlags,
        recommendation: this.getRecommendation(fraudScore)
      };
    } catch (error) {
      console.error('Fraud analysis error:', error);
      throw error;
    }
  }

  /**
   * Calculate fraud score based on multiple factors
   */
  async calculateFraudScore(transactionData, user, flagsArray) {
    const { amount, paymentMethod, ipAddress, userAgent, ticketIds = [], eventIds = [] } = transactionData;

    let score = 0;

    // 1. Velocity Check: Multiple transactions in short time
    const velocityScore = await this.checkTransactionVelocity(user.id);
    score += velocityScore;
    if (velocityScore > 0) {
      flagsArray.push({
        type: 'VELOCITY_CHECK',
        severity: velocityScore > 30 ? 'high' : 'medium',
        message: `${velocityScore}% - Multiple transactions detected in short period`
      });
    }

    // 2. Amount Anomaly Check
    const amountScore = await this.checkAmountAnomaly(user.id, amount);
    score += amountScore;
    if (amountScore > 0) {
      flagsArray.push({
        type: 'AMOUNT_ANOMALY',
        severity: amountScore > 30 ? 'high' : 'medium',
        message: `${amountScore}% - Unusual transaction amount for this user`
      });
    }

    // 3. Duplicate Purchase Detection
    const duplicateScore = await this.checkDuplicatePurchases(user.id, ticketIds, eventIds);
    score += duplicateScore;
    if (duplicateScore > 0) {
      flagsArray.push({
        type: 'DUPLICATE_PURCHASE',
        severity: 'high',
        message: 'Potential duplicate purchase attempt detected'
      });
    }

    // 4. New Payment Method Check
    const newPaymentScore = await this.checkNewPaymentMethod(user.id, paymentMethod);
    score += newPaymentScore;
    if (newPaymentScore > 0) {
      flagsArray.push({
        type: 'NEW_PAYMENT_METHOD',
        severity: 'medium',
        message: 'New payment method being used'
      });
    }

    // 5. IP Address Change Check
    const ipScore = await this.checkIPAnomaly(user.id, ipAddress);
    score += ipScore;
    if (ipScore > 0) {
      flagsArray.push({
        type: 'IP_ANOMALY',
        severity: ipScore > 25 ? 'high' : 'medium',
        message: 'Transaction from unusual IP location'
      });
    }

    // 6. Chargeback/Refund History
    const chargebackScore = await this.checkChargebackHistory(user.id);
    score += chargebackScore;
    if (chargebackScore > 0) {
      flagsArray.push({
        type: 'CHARGEBACK_HISTORY',
        severity: 'high',
        message: 'User has history of chargebacks/refunds'
      });
    }

    // 7. Account Age Check
    const accountAgeScore = await this.checkAccountAge(user.id);
    score += accountAgeScore;
    if (accountAgeScore > 0) {
      flagsArray.push({
        type: 'NEW_ACCOUNT',
        severity: 'medium',
        message: 'Account created recently'
      });
    }

    // 8. Email/Phone Verification Status
    const verificationScore = await this.checkVerificationStatus(user);
    score += verificationScore;
    if (verificationScore > 0) {
      flagsArray.push({
        type: 'UNVERIFIED_ACCOUNT',
        severity: 'medium',
        message: 'Email and/or phone not verified'
      });
    }

    // Normalize score to 0-100
    return Math.min(score, 100);
  }

  /**
   * Check transaction velocity (multiple transactions in short period)
   */
  async checkTransactionVelocity(userId) {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Count transactions in last hour
      const recentTransactions = await db('payments')
        .where('user_id', userId)
        .where('status', 'completed')
        .where('payment_date', '>=', oneHourAgo)
        .count('* as count')
        .first();

      // Count transactions in last week
      const weeklyTransactions = await db('payments')
        .where('user_id', userId)
        .where('status', 'completed')
        .where('payment_date', '>=', oneWeekAgo)
        .count('* as count')
        .first();

      let score = 0;

      // More than 5 transactions in 1 hour is suspicious
      if (recentTransactions.count > 5) {
        score += 40;
      } else if (recentTransactions.count > 3) {
        score += 20;
      }

      // More than 20 transactions in 1 week is suspicious
      if (weeklyTransactions.count > 20) {
        score += 20;
      } else if (weeklyTransactions.count > 10) {
        score += 10;
      }

      return score;
    } catch (error) {
      console.error('Velocity check error:', error);
      return 0;
    }
  }

  /**
   * Check for unusual transaction amount
   */
  async checkAmountAnomaly(userId, currentAmount) {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const stats = await db('payments')
        .where('user_id', userId)
        .where('status', 'completed')
        .where('payment_date', '>=', thirtyDaysAgo)
        .avg('amount as avg_amount')
        .max('amount as max_amount')
        .min('amount as min_amount')
        .first();

      if (!stats.avg_amount) {
        return 0; // New user, no history
      }

      const avgAmount = parseFloat(stats.avg_amount);
      const maxAmount = parseFloat(stats.max_amount);

      // If amount is 3x average, it's suspicious
      if (currentAmount > avgAmount * 3) {
        return 30;
      }

      // If amount is 1.5x the user's historical max
      if (currentAmount > maxAmount * 1.5) {
        return 15;
      }

      return 0;
    } catch (error) {
      console.error('Amount anomaly check error:', error);
      return 0;
    }
  }

  /**
   * Check for duplicate purchase attempts
   */
  async checkDuplicatePurchases(userId, ticketIds = [], eventIds = []) {
    try {
      if (ticketIds.length === 0 && eventIds.length === 0) {
        return 0;
      }

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      // Check if same tickets were purchased recently
      if (ticketIds.length > 0) {
        const duplicates = await db('tickets')
          .whereIn('id', ticketIds)
          .where('user_id', userId)
          .where('purchase_date', '>=', fiveMinutesAgo)
          .count('* as count')
          .first();

        if (duplicates.count > 0) {
          return 50;
        }
      }

      // Check if multiple tickets for same event were just purchased
      if (eventIds.length > 0) {
        const recentEventTickets = await db('tickets')
          .whereIn('event_id', eventIds)
          .where('user_id', userId)
          .where('purchase_date', '>=', fiveMinutesAgo)
          .count('* as count')
          .first();

        if (recentEventTickets.count > 5) {
          return 30;
        }
      }

      return 0;
    } catch (error) {
      console.error('Duplicate purchase check error:', error);
      return 0;
    }
  }

  /**
   * Check if new payment method is being used
   */
  async checkNewPaymentMethod(userId, paymentMethod) {
    try {
      const existingMethods = await db('payments')
        .where('user_id', userId)
        .where('status', 'completed')
        .where('payment_method', paymentMethod)
        .count('* as count')
        .first();

      // First time using this payment method = slightly suspicious
      if (existingMethods.count === 0) {
        return 15;
      }

      return 0;
    } catch (error) {
      console.error('New payment method check error:', error);
      return 0;
    }
  }

  /**
   * Check for IP address anomalies
   */
  async checkIPAnomaly(userId, currentIP) {
    try {
      if (!currentIP) {
        return 10; // Missing IP info
      }

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Get user's typical IPs
      const usedIPs = await db('payments')
        .where('user_id', userId)
        .where('payment_date', '>=', thirtyDaysAgo)
        .distinct('ip_address')
        .pluck('ip_address');

      // If IP not in user's history
      if (usedIPs.length > 0 && !usedIPs.includes(currentIP)) {
        // If user typically uses only 1 IP, new IP is more suspicious
        if (usedIPs.length === 1) {
          return 25;
        } else if (usedIPs.length <= 3) {
          return 15;
        }
      }

      return 0;
    } catch (error) {
      console.error('IP anomaly check error:', error);
      return 0;
    }
  }

  /**
   * Check for chargeback/refund history
   */
  async checkChargebackHistory(userId) {
    try {
      const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

      const refundedPayments = await db('payments')
        .where('user_id', userId)
        .where('status', 'like', '%refunded%')
        .where('refund_processed_at', '>=', sixMonthsAgo)
        .count('* as count')
        .first();

      if (refundedPayments.count > 2) {
        return 40; // Multiple refunds
      } else if (refundedPayments.count > 0) {
        return 20; // Some refunds
      }

      return 0;
    } catch (error) {
      console.error('Chargeback history check error:', error);
      return 0;
    }
  }

  /**
   * Check account age
   */
  async checkAccountAge(userId) {
    try {
      const user = await db('users').where('id', userId).first();

      if (!user) {
        return 0;
      }

      const accountAgeMs = Date.now() - new Date(user.created_at).getTime();
      const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);

      // Brand new account (< 1 day)
      if (accountAgeDays < 1) {
        return 35;
      }

      // Very new account (< 7 days)
      if (accountAgeDays < 7) {
        return 20;
      }

      // New account (< 30 days)
      if (accountAgeDays < 30) {
        return 10;
      }

      return 0;
    } catch (error) {
      console.error('Account age check error:', error);
      return 0;
    }
  }

  /**
   * Check verification status
   */
  async checkVerificationStatus(user) {
    let score = 0;

    if (!user.email_verified) {
      score += 10;
    }

    if (!user.phone_verified) {
      score += 10;
    }

    return score;
  }

  /**
   * Get recommendation based on fraud score
   */
  getRecommendation(fraudScore) {
    if (fraudScore >= 80) {
      return 'BLOCK'; // Block transaction
    } else if (fraudScore >= 60) {
      return 'MANUAL_REVIEW'; // Require manual review
    } else if (fraudScore >= 40) {
      return 'VERIFY'; // Request additional verification
    } else {
      return 'APPROVE'; // Approve transaction
    }
  }

  /**
   * Log fraud flag for monitoring
   */
  async logFraudFlag(transactionId, fraudData, user) {
    try {
      await db('audit_logs').insert({
        id: uuidv4(),
        user_id: user.id,
        action: 'FRAUD_FLAG_DETECTED',
        resource: 'payments',
        resource_id: transactionId,
        is_suspicious: true,
        metadata: JSON.stringify(fraudData),
        timestamp: db.fn.now()
      });
    } catch (error) {
      console.error('Error logging fraud flag:', error);
    }
  }

  /**
   * Get suspicious transactions
   */
  async getSuspiciousTransactions(filters = {}) {
    try {
      let query = db('payments').where('is_suspicious', true).whereNull('deleted_at');

      if (filters.status) {
        query = query.where('status', filters.status);
      }

      if (filters.minScore) {
        // This would require storing fraud_score in payments table
        // For now, we're just filtering by is_suspicious flag
      }

      if (filters.startDate) {
        query = query.where('payment_date', '>=', filters.startDate);
      }

      if (filters.endDate) {
        query = query.where('payment_date', '<=', filters.endDate);
      }

      const transactions = await query
        .orderBy('payment_date', 'desc')
        .limit(filters.limit || 50);

      return transactions;
    } catch (error) {
      console.error('Error fetching suspicious transactions:', error);
      throw error;
    }
  }
}

module.exports = new FraudDetectionService();
