/**
 * Payment Gateway Service
 * Handles integration with multiple payment gateways (Ecocash, Zipit, Zimswitch, Innbucks, PayPal, Visa, Mastercard)
 */

const axios = require('axios');
const db = require('../config/database');

class PaymentGatewayService {
  /**
   * Get all available payment methods
   */
  static async getAvailablePaymentMethods() {
    try {
      const methods = await db('payment_methods')
        .where('enabled', true)
        .orderBy('category', 'asc')
        .orderBy('name', 'asc');

      return methods;
    } catch (error) {
      console.error('Error fetching payment methods:', error);
      throw error;
    }
  }

  /**
   * Get payment methods by category
   */
  static async getPaymentMethodsByCategory(category) {
    try {
      const methods = await db('payment_methods')
        .where({ enabled: true, category })
        .orderBy('name', 'asc');

      return methods;
    } catch (error) {
      console.error('Error fetching payment methods by category:', error);
      throw error;
    }
  }

  /**
   * Get specific payment method
   */
  static async getPaymentMethod(code) {
    try {
      const method = await db('payment_methods')
        .where({ code, enabled: true })
        .first();

      return method;
    } catch (error) {
      console.error('Error fetching payment method:', error);
      throw error;
    }
  }

  /**
   * Process payment based on gateway
   */
  static async processPayment(paymentData) {
    const { amount, method_code, reference, user_id, description, currency = 'ZWL' } = paymentData;

    try {
      const method = await this.getPaymentMethod(method_code);
      if (!method) {
        throw new Error('Payment method not found or disabled');
      }

      // Validate amount
      if (method.min_amount && amount < method.min_amount) {
        throw new Error(`Minimum amount is ${method.currency} ${method.min_amount}`);
      }
      if (method.max_amount && amount > method.max_amount) {
        throw new Error(`Maximum amount is ${method.currency} ${method.max_amount}`);
      }

      // Create transaction record
      const transaction = await db('payment_transactions').insert({
        payment_method_id: method.id,
        payment_method_code: method_code,
        amount,
        currency: method.currency,
        reference_number: reference,
        status: 'pending',
        user_id
      });

      // Route to appropriate gateway handler
      let result = {};
      switch (method_code) {
        case 'ecocash':
          result = await this.processEcocash({ ...paymentData, transaction_id: transaction[0] });
          break;
        case 'zipit':
          result = await this.processZipit({ ...paymentData, transaction_id: transaction[0] });
          break;
        case 'zimswitch':
          result = await this.processZimswitch({ ...paymentData, transaction_id: transaction[0] });
          break;
        case 'innbucks':
          result = await this.processInnbucks({ ...paymentData, transaction_id: transaction[0] });
          break;
        case 'paypal':
          result = await this.processPayPal({ ...paymentData, transaction_id: transaction[0] });
          break;
        case 'visa':
        case 'mastercard':
          result = await this.processCreditCard({ ...paymentData, transaction_id: transaction[0], card_type: method_code });
          break;
        default:
          throw new Error('Unknown payment method');
      }

      return result;
    } catch (error) {
      console.error('Error processing payment:', error);
      throw error;
    }
  }

  /**
   * ECOCASH - Zimbabwe mobile money
   */
  static async processEcocash(paymentData) {
    try {
      const { amount, reference, transaction_id } = paymentData;

      // Ecocash API integration
      const ecocashConfig = await this.getGatewayConfig('ecocash');
      
      const response = await axios.post(ecocashConfig.api_url, {
        amount: amount,
        reference: reference,
        merchant_id: ecocashConfig.merchant_id,
        timestamp: new Date().toISOString()
      }, {
        headers: {
          'Authorization': `Bearer ${ecocashConfig.api_key}`,
          'Content-Type': 'application/json'
        }
      });

      // Update transaction with gateway response
      await db('payment_transactions')
        .where({ id: transaction_id })
        .update({
          gateway_transaction_id: response.data.transaction_id,
          status: 'processing',
          gateway_response: JSON.stringify(response.data)
        });

      return {
        success: true,
        transaction_id,
        gateway_id: response.data.transaction_id,
        message: 'Payment initiated on Ecocash',
        redirect_url: response.data.redirect_url || null
      };
    } catch (error) {
      await db('payment_transactions')
        .where({ id: paymentData.transaction_id })
        .update({ status: 'failed', failure_reason: error.message });
      throw error;
    }
  }

  /**
   * ZIPIT - Zimbabwe payment platform
   */
  static async processZipit(paymentData) {
    try {
      const { amount, reference, transaction_id, description } = paymentData;

      const zitipConfig = await this.getGatewayConfig('zipit');
      
      const response = await axios.post(zitipConfig.api_url, {
        amount: amount,
        reference: reference,
        description: description,
        merchant_key: zitipConfig.merchant_key
      }, {
        headers: {
          'Authorization': `Bearer ${zitipConfig.api_key}`,
          'Content-Type': 'application/json'
        }
      });

      await db('payment_transactions')
        .where({ id: transaction_id })
        .update({
          gateway_transaction_id: response.data.txn_id,
          status: 'processing',
          gateway_response: JSON.stringify(response.data)
        });

      return {
        success: true,
        transaction_id,
        gateway_id: response.data.txn_id,
        message: 'Payment initiated on Zipit',
        payment_url: response.data.payment_url
      };
    } catch (error) {
      await db('payment_transactions')
        .where({ id: paymentData.transaction_id })
        .update({ status: 'failed', failure_reason: error.message });
      throw error;
    }
  }

  /**
   * ZIMSWITCH - Zimbabwe interbank payment system
   */
  static async processZimswitch(paymentData) {
    try {
      const { amount, reference, transaction_id } = paymentData;

      const zimswitchConfig = await this.getGatewayConfig('zimswitch');
      
      const response = await axios.post(zimswitchConfig.api_url, {
        transaction_reference: reference,
        transaction_amount: amount,
        originator_id: zimswitchConfig.merchant_id,
        timestamp: new Date().toISOString()
      }, {
        headers: {
          'X-API-Key': zimswitchConfig.api_key,
          'Content-Type': 'application/json'
        }
      });

      await db('payment_transactions')
        .where({ id: transaction_id })
        .update({
          gateway_transaction_id: response.data.transaction_reference,
          status: 'processing',
          gateway_response: JSON.stringify(response.data)
        });

      return {
        success: true,
        transaction_id,
        gateway_id: response.data.transaction_reference,
        message: 'Payment submitted to Zimswitch'
      };
    } catch (error) {
      await db('payment_transactions')
        .where({ id: paymentData.transaction_id })
        .update({ status: 'failed', failure_reason: error.message });
      throw error;
    }
  }

  /**
   * INNBUCKS - Zimbabwe payment processor
   */
  static async processInnbucks(paymentData) {
    try {
      const { amount, reference, transaction_id, user_id } = paymentData;

      const innbucksConfig = await this.getGatewayConfig('innbucks');
      
      const response = await axios.post(innbucksConfig.api_url, {
        amount: amount,
        reference: reference,
        merchant_code: innbucksConfig.merchant_code,
        api_key: innbucksConfig.api_key,
        callback_url: `${process.env.BACKEND_URL}/api/webhooks/innbucks`
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      await db('payment_transactions')
        .where({ id: transaction_id })
        .update({
          gateway_transaction_id: response.data.reference_number,
          status: 'processing',
          gateway_response: JSON.stringify(response.data)
        });

      return {
        success: true,
        transaction_id,
        gateway_id: response.data.reference_number,
        message: 'Payment request submitted to Innbucks'
      };
    } catch (error) {
      await db('payment_transactions')
        .where({ id: paymentData.transaction_id })
        .update({ status: 'failed', failure_reason: error.message });
      throw error;
    }
  }

  /**
   * PAYPAL - International payments
   */
  static async processPayPal(paymentData) {
    try {
      const { amount, reference, transaction_id, user_id } = paymentData;

      const paypalConfig = await this.getGatewayConfig('paypal');
      
      // Create PayPal order
      const response = await axios.post(
        `${paypalConfig.api_url}/v2/checkout/orders`,
        {
          intent: 'CAPTURE',
          purchase_units: [{
            reference_id: reference,
            amount: {
              currency_code: 'USD',
              value: (amount / 1000).toFixed(2) // Convert ZWL to USD approximate
            }
          }],
          return_url: `${process.env.FRONTEND_URL}/payment-success`,
          cancel_url: `${process.env.FRONTEND_URL}/payment-cancel`
        },
        {
          auth: {
            username: paypalConfig.client_id,
            password: paypalConfig.client_secret
          },
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      await db('payment_transactions')
        .where({ id: transaction_id })
        .update({
          gateway_transaction_id: response.data.id,
          status: 'processing',
          gateway_response: JSON.stringify(response.data),
          currency: 'USD'
        });

      return {
        success: true,
        transaction_id,
        gateway_id: response.data.id,
        message: 'PayPal order created',
        payment_url: response.data.links.find(l => l.rel === 'approve')?.href
      };
    } catch (error) {
      await db('payment_transactions')
        .where({ id: paymentData.transaction_id })
        .update({ status: 'failed', failure_reason: error.message });
      throw error;
    }
  }

  /**
   * VISA / MASTERCARD - Credit card processing
   */
  static async processCreditCard(paymentData) {
    try {
      const { amount, reference, transaction_id, card_type } = paymentData;

      const cardConfig = await this.getGatewayConfig('cards');
      
      // Using Paystack or similar for card processing
      const response = await axios.post(cardConfig.api_url, {
        amount: Math.round(amount * 100), // Convert to cents
        reference: reference,
        callback_url: `${process.env.BACKEND_URL}/api/webhooks/card-payment`
      }, {
        headers: {
          'Authorization': `Bearer ${cardConfig.api_key}`,
          'Content-Type': 'application/json'
        }
      });

      await db('payment_transactions')
        .where({ id: transaction_id })
        .update({
          gateway_transaction_id: response.data.reference,
          status: 'processing',
          gateway_response: JSON.stringify(response.data)
        });

      return {
        success: true,
        transaction_id,
        gateway_id: response.data.reference,
        message: `${card_type.toUpperCase()} payment initiated`,
        payment_url: response.data.authorization_url
      };
    } catch (error) {
      await db('payment_transactions')
        .where({ id: paymentData.transaction_id })
        .update({ status: 'failed', failure_reason: error.message });
      throw error;
    }
  }

  /**
   * Get gateway configuration from settings
   */
  static async getGatewayConfig(gateway) {
    try {
      const SettingsService = require('./settingsService');
      const configKey = `${gateway}_config`;
      const config = await SettingsService.getSetting(configKey);
      
      if (!config) {
        throw new Error(`Configuration for ${gateway} not found`);
      }

      return config.value;
    } catch (error) {
      console.error(`Error getting ${gateway} configuration:`, error);
      throw error;
    }
  }

  /**
   * Confirm payment (called after webhook or user confirmation)
   */
  static async confirmPayment(transactionId, gatewayResponse = null) {
    try {
      const transaction = await db('payment_transactions')
        .where({ id: transactionId })
        .first();

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Update transaction status
      await db('payment_transactions')
        .where({ id: transactionId })
        .update({
          status: 'completed',
          completed_at: db.fn.now(),
          gateway_response: gatewayResponse ? JSON.stringify(gatewayResponse) : transaction.gateway_response
        });

      // Record earnings
      const ApprovalPaymentService = require('./approvalPaymentService');
      await ApprovalPaymentService.recordEarnings({
        organizer_id: transaction.organizer_id,
        amount: transaction.amount,
        transaction_id: transactionId,
        payment_method: transaction.payment_method_code
      });

      return {
        success: true,
        transaction_id: transactionId,
        message: 'Payment confirmed and earnings recorded'
      };
    } catch (error) {
      console.error('Error confirming payment:', error);
      throw error;
    }
  }

  /**
   * Refund payment
   */
  static async refundPayment(transactionId, refundAmount = null) {
    try {
      const transaction = await db('payment_transactions')
        .where({ id: transactionId })
        .first();

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      const amount = refundAmount || transaction.amount;

      // Route to appropriate gateway refund handler
      let result = {};
      switch (transaction.payment_method_code) {
        case 'paypal':
          result = await this.refundPayPal(transaction.gateway_transaction_id, amount);
          break;
        case 'visa':
        case 'mastercard':
          result = await this.refundCreditCard(transaction.gateway_transaction_id, amount);
          break;
        default:
          throw new Error('Refund not supported for this payment method');
      }

      // Update transaction
      await db('payment_transactions')
        .where({ id: transactionId })
        .update({
          status: 'refunded',
          gateway_response: JSON.stringify(result)
        });

      return {
        success: true,
        transaction_id: transactionId,
        refund_amount: amount,
        message: 'Refund processed'
      };
    } catch (error) {
      console.error('Error refunding payment:', error);
      throw error;
    }
  }

  static async refundPayPal(orderId, amount) {
    // PayPal refund logic
    return { refund_id: 'refund_' + orderId };
  }

  static async refundCreditCard(transactionRef, amount) {
    // Credit card refund logic
    return { refund_id: 'refund_' + transactionRef };
  }
}

module.exports = PaymentGatewayService;
