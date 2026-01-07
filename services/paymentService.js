const db = require('../config/database');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const paypal = require('paypal-rest-sdk');
const { v4: uuidv4 } = require('uuid');
const auditService = require('./auditService');

// Configure PayPal
paypal.configure({
  mode: process.env.PAYPAL_MODE || 'sandbox',
  client_id: process.env.PAYPAL_CLIENT_ID,
  client_secret: process.env.PAYPAL_CLIENT_SECRET
});

class PaymentService {
  /**
   * Initiate payment - supports multiple gateways
   */
  async initiatePayment(paymentData, user) {
    try {
      const {
        amount,
        currency = 'USD',
        gateway = 'stripe',
        paymentMethod,
        orderId,
        ticketIds = [],
        metadata = {}
      } = paymentData;

      // Validate amount
      if (!amount || amount <= 0) {
        throw new Error('Invalid payment amount');
      }

      const transactionId = uuidv4();
      const referenceNumber = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create payment record
      const payment = await db('payments').insert({
        id: uuidv4(),
        user_id: user.id,
        transaction_id: transactionId,
        reference_number: referenceNumber,
        payment_method: paymentMethod,
        gateway: gateway,
        amount: amount,
        currency: currency,
        total_amount: amount,
        status: 'pending',
        metadata: JSON.stringify({
          orderId,
          ticketIds,
          ...metadata
        }),
        ip_address: metadata.ipAddress,
        user_agent: metadata.userAgent
      }).returning('*');

      let paymentIntent;

      // Route Mastercard/Visa to Stripe
      if (
        gateway === 'stripe' ||
        (gateway === 'card' && (paymentMethod === 'mastercard' || paymentMethod === 'visa')) ||
        paymentMethod === 'mastercard' ||
        paymentMethod === 'visa'
      ) {
        paymentIntent = await this.initiateStripePayment(amount, currency, referenceNumber, user);
      } else if (gateway === 'paypal' || paymentMethod === 'paypal') {
        paymentIntent = await this.initiatePayPalPayment(amount, currency, referenceNumber, user);
      } else if (gateway === 'zim_gateway') {
        paymentIntent = await this.initiateZimPayment(amount, currency, referenceNumber, user);
      } else {
        throw new Error('Unsupported payment gateway');
      }

      // Log audit
      await auditService.log({
        userId: user.id,
        action: 'PAYMENT_INITIATED',
        resource: 'payments',
        resourceId: payment[0].id,
        newValues: { ...payment[0], status: 'pending' },
        metadata: { gateway, amount, currency }
      });

      return {
        success: true,
        paymentId: payment[0].id,
        transactionId: transactionId,
        referenceNumber: referenceNumber,
        paymentIntent: paymentIntent
      };
    } catch (error) {
      console.error('Payment initiation error:', error);
      throw error;
    }
  }

  /**
   * Stripe payment initialization
   */
  async initiateStripePayment(amount, currency, referenceNumber, user) {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        payment_method_types: ['card'],
        metadata: {
          referenceNumber: referenceNumber,
          userId: user.id,
          email: user.email
        }
      });

      return {
        clientSecret: paymentIntent.client_secret,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
      };
    } catch (error) {
      console.error('Stripe payment error:', error);
      throw error;
    }
  }

  /**
   * PayPal payment initialization
   */
  async initiatePayPalPayment(amount, currency, referenceNumber, user) {
    return new Promise((resolve, reject) => {
      const payment = {
        intent: 'sale',
        payer: {
          payment_method: 'paypal',
          payer_info: {
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            phone: user.phone
          }
        },
        redirect_urls: {
          return_url: `${process.env.FRONTEND_URL}/payment/success`,
          cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`
        },
        transactions: [
          {
            amount: {
              total: amount.toString(),
              currency: currency,
              details: {
                subtotal: amount.toString()
              }
            },
            description: `Payment for tickets - Reference: ${referenceNumber}`,
            invoice_number: referenceNumber
          }
        ]
      };

      paypal.payment.create(payment, (error, payment) => {
        if (error) {
          reject(error);
        } else {
          const approvalUrl = payment.links.find(link => link.rel === 'approval_url');
          resolve({
            approvalUrl: approvalUrl.href,
            paymentId: payment.id
          });
        }
      });
    });
  }

  /**
   * Zimbabwe payment gateway initialization
   */
  async initiateZimPayment(amount, currency, referenceNumber, user) {
    try {
      // This is a placeholder - integrate with actual ZIM gateway (Ecocash, OneMoney, etc.)
      // For now, returning a mock response
      return {
        paymentUrl: `${process.env.ZIM_GATEWAY_URL}/pay?ref=${referenceNumber}&amount=${amount}`,
        referenceNumber: referenceNumber,
        provider: process.env.ZIM_GATEWAY_PROVIDER || 'ecocash'
      };
    } catch (error) {
      console.error('ZIM payment error:', error);
      throw error;
    }
  }

  /**
   * Verify and complete payment
   */
  async completePayment(paymentId, paymentVerificationData, user) {
    try {
      const payment = await db('payments').where({ id: paymentId }).first();

      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.user_id !== user.id && user.role !== 'admin') {
        throw new Error('Unauthorized access to payment');
      }

      let verificationResult;

      switch (payment.gateway) {
        case 'stripe':
          verificationResult = await this.verifyStripePayment(paymentVerificationData, payment);
          break;
        case 'paypal':
          verificationResult = await this.verifyPayPalPayment(paymentVerificationData, payment);
          break;
        case 'zim_gateway':
          verificationResult = await this.verifyZimPayment(paymentVerificationData, payment);
          break;
        default:
          throw new Error('Unsupported payment gateway');
      }

      if (!verificationResult.success) {
        // Update payment status to failed
        await db('payments').where({ id: paymentId }).update({
          status: 'failed',
          failure_reason: verificationResult.reason,
          failed_at: db.fn.now()
        });

        await auditService.log({
          userId: user.id,
          action: 'PAYMENT_FAILED',
          resource: 'payments',
          resourceId: paymentId,
          metadata: { reason: verificationResult.reason }
        });

        return {
          success: false,
          message: 'Payment verification failed',
          reason: verificationResult.reason
        };
      }

      // Update payment status to completed
      await db('payments').where({ id: paymentId }).update({
        status: 'completed',
        gateway_transaction_id: verificationResult.transactionId,
        gateway_response: JSON.stringify(verificationResult.response),
        completed_at: db.fn.now()
      });

      // Mark associated tickets as confirmed
      const metadata = JSON.parse(payment.metadata || '{}');
      if (metadata.ticketIds && metadata.ticketIds.length > 0) {
        await db('tickets').whereIn('id', metadata.ticketIds).update({
          status: 'confirmed',
          purchase_date: db.fn.now()
        });
      }

      await auditService.log({
        userId: user.id,
        action: 'PAYMENT_COMPLETED',
        resource: 'payments',
        resourceId: paymentId,
        newValues: { status: 'completed' }
      });

      return {
        success: true,
        paymentId: paymentId,
        transactionId: payment.transaction_id,
        message: 'Payment completed successfully'
      };
    } catch (error) {
      console.error('Payment completion error:', error);
      throw error;
    }
  }

  /**
   * Verify Stripe payment
   */
  async verifyStripePayment(verificationData, payment) {
    try {
      const { paymentIntentId } = verificationData;

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status !== 'succeeded') {
        return {
          success: false,
          reason: `Payment status is ${paymentIntent.status}`
        };
      }

      return {
        success: true,
        transactionId: paymentIntent.id,
        response: paymentIntent
      };
    } catch (error) {
      console.error('Stripe verification error:', error);
      return {
        success: false,
        reason: error.message
      };
    }
  }

  /**
   * Verify PayPal payment
   */
  async verifyPayPalPayment(verificationData, payment) {
    return new Promise((resolve) => {
      const { paymentId, payerId } = verificationData;

      const executePayment = {
        payer_id: payerId
      };

      paypal.payment.execute(paymentId, executePayment, (error, payment) => {
        if (error) {
          resolve({
            success: false,
            reason: error.message
          });
        } else {
          const sale = payment.transactions[0].related_resources[0].sale;
          resolve({
            success: payment.state === 'approved',
            transactionId: sale.id,
            response: payment
          });
        }
      });
    });
  }

  /**
   * Verify Zimbabwe payment gateway
   */
  async verifyZimPayment(verificationData, payment) {
    try {
      const { referenceNumber, status } = verificationData;

      // This is a placeholder - integrate with actual ZIM gateway
      if (referenceNumber === payment.reference_number && status === 'completed') {
        return {
          success: true,
          transactionId: `ZIM-${Date.now()}`,
          response: { status: 'completed', referenceNumber }
        };
      }

      return {
        success: false,
        reason: 'ZIM gateway verification failed'
      };
    } catch (error) {
      console.error('ZIM verification error:', error);
      return {
        success: false,
        reason: error.message
      };
    }
  }

  /**
   * Process refund
   */
  async processRefund(paymentId, refundAmount, reason, user) {
    try {
      const payment = await db('payments').where({ id: paymentId }).first();

      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.user_id !== user.id && user.role !== 'admin') {
        throw new Error('Unauthorized access to payment');
      }

      if (payment.status !== 'completed') {
        throw new Error('Can only refund completed payments');
      }

      const refundAmt = refundAmount || payment.amount;

      let refundResult;

      switch (payment.gateway) {
        case 'stripe':
          refundResult = await this.refundStripePayment(payment, refundAmt);
          break;
        case 'paypal':
          refundResult = await this.refundPayPalPayment(payment, refundAmt);
          break;
        case 'zim_gateway':
          refundResult = await this.refundZimPayment(payment, refundAmt);
          break;
        default:
          throw new Error('Unsupported payment gateway');
      }

      if (!refundResult.success) {
        throw new Error(refundResult.reason);
      }

      // Update payment record
      const newRefundedAmount = (payment.refunded_amount || 0) + refundAmt;
      const newStatus = newRefundedAmount >= payment.amount ? 'refunded' : 'partially_refunded';

      await db('payments').where({ id: paymentId }).update({
        status: newStatus,
        refunded_amount: newRefundedAmount,
        refund_processed_at: db.fn.now(),
        refund_reason: reason
      });

      await auditService.log({
        userId: user.id,
        action: 'PAYMENT_REFUNDED',
        resource: 'payments',
        resourceId: paymentId,
        metadata: { refundAmount: refundAmt, reason }
      });

      return {
        success: true,
        paymentId: paymentId,
        refundedAmount: refundAmt,
        newStatus: newStatus
      };
    } catch (error) {
      console.error('Refund processing error:', error);
      throw error;
    }
  }

  /**
   * Refund Stripe payment
   */
  async refundStripePayment(payment, refundAmount) {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: payment.gateway_transaction_id,
        amount: Math.round(refundAmount * 100)
      });

      return {
        success: refund.status === 'succeeded',
        refundId: refund.id
      };
    } catch (error) {
      console.error('Stripe refund error:', error);
      return {
        success: false,
        reason: error.message
      };
    }
  }

  /**
   * Refund PayPal payment
   */
  async refundPayPalPayment(payment, refundAmount) {
    return new Promise((resolve) => {
      const saleId = payment.gateway_transaction_id;

      paypal.sale.get(saleId, (error, sale) => {
        if (error) {
          resolve({
            success: false,
            reason: error.message
          });
        } else {
          sale.refund({ amount: refundAmount.toString() }, (error, refund) => {
            if (error) {
              resolve({
                success: false,
                reason: error.message
              });
            } else {
              resolve({
                success: refund.state === 'completed',
                refundId: refund.id
              });
            }
          });
        }
      });
    });
  }

  /**
   * Refund Zimbabwe payment
   */
  async refundZimPayment(payment, refundAmount) {
    try {
      // Placeholder for actual ZIM gateway refund
      return {
        success: true,
        refundId: `ZIM-REFUND-${Date.now()}`
      };
    } catch (error) {
      return {
        success: false,
        reason: error.message
      };
    }
  }

  /**
   * Get payment by ID
   */
  async getPaymentById(paymentId) {
    try {
      return await db('payments').where({ id: paymentId }).first();
    } catch (error) {
      console.error('Error fetching payment:', error);
      throw error;
    }
  }

  /**
   * Get user payments
   */
  async getUserPayments(userId, filters = {}) {
    try {
      let query = db('payments').where({ user_id: userId }).whereNull('deleted_at');

      if (filters.status) {
        query = query.where({ status: filters.status });
      }

      if (filters.gateway) {
        query = query.where({ gateway: filters.gateway });
      }

      if (filters.startDate) {
        query = query.where('payment_date', '>=', filters.startDate);
      }

      if (filters.endDate) {
        query = query.where('payment_date', '<=', filters.endDate);
      }

      const payments = await query.orderBy('payment_date', 'desc').limit(filters.limit || 50);
      return payments;
    } catch (error) {
      console.error('Error fetching user payments:', error);
      throw error;
    }
  }
}

module.exports = new PaymentService();
