/**
 * Seed: Initialize Payment Methods
 * Sets up all available payment gateways
 */

exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('payment_methods').del();

  // Inserts seed entries
  await knex('payment_methods').insert([
    // LOCAL PAYMENT METHODS - ZIMBABWE
    {
      code: 'ecocash',
      name: 'Ecocash',
      category: 'local',
      description: 'Zimbabwe mobile money service',
      enabled: true,
      gateway_provider: 'Econet',
      config: JSON.stringify({
        api_url: process.env.ECOCASH_API_URL || 'https://api.ecocash.com.zw',
        merchant_id: process.env.ECOCASH_MERCHANT_ID || '',
        api_key: process.env.ECOCASH_API_KEY || ''
      }),
      min_amount: 1,
      max_amount: 100000,
      currency: 'ZWL',
      fees: JSON.stringify({ percentage: 2, fixed: 0 }),
      processing_time_minutes: 5
    },
    {
      code: 'zipit',
      name: 'Zipit',
      category: 'local',
      description: 'Zimbabwe payment platform',
      enabled: true,
      gateway_provider: 'Zipit',
      config: JSON.stringify({
        api_url: process.env.ZIPIT_API_URL || 'https://api.zipit.co.zw',
        merchant_key: process.env.ZIPIT_MERCHANT_KEY || '',
        api_key: process.env.ZIPIT_API_KEY || ''
      }),
      min_amount: 1,
      max_amount: 100000,
      currency: 'ZWL',
      fees: JSON.stringify({ percentage: 1.5, fixed: 0 }),
      processing_time_minutes: 10
    },
    {
      code: 'zimswitch',
      name: 'Zimswitch',
      category: 'local',
      description: 'Zimbabwe interbank payment system',
      enabled: true,
      gateway_provider: 'Zimswitch',
      config: JSON.stringify({
        api_url: process.env.ZIMSWITCH_API_URL || 'https://api.zimswitch.co.zw',
        merchant_id: process.env.ZIMSWITCH_MERCHANT_ID || '',
        api_key: process.env.ZIMSWITCH_API_KEY || ''
      }),
      min_amount: 0.01,
      max_amount: 1000000,
      currency: 'ZWL',
      fees: JSON.stringify({ percentage: 1, fixed: 0 }),
      processing_time_minutes: 30
    },
    {
      code: 'innbucks',
      name: 'Innbucks',
      category: 'local',
      description: 'Zimbabwe payment processor',
      enabled: true,
      gateway_provider: 'Innbucks',
      config: JSON.stringify({
        api_url: process.env.INNBUCKS_API_URL || 'https://api.innbucks.com',
        merchant_code: process.env.INNBUCKS_MERCHANT_CODE || '',
        api_key: process.env.INNBUCKS_API_KEY || ''
      }),
      min_amount: 1,
      max_amount: 500000,
      currency: 'ZWL',
      fees: JSON.stringify({ percentage: 2.5, fixed: 0 }),
      processing_time_minutes: 15
    },

    // INTERNATIONAL PAYMENT METHODS
    {
      code: 'paypal',
      name: 'PayPal',
      category: 'international',
      description: 'PayPal international payments',
      enabled: true,
      gateway_provider: 'PayPal',
      config: JSON.stringify({
        api_url: process.env.PAYPAL_API_URL || 'https://api-m.sandbox.paypal.com',
        client_id: process.env.PAYPAL_CLIENT_ID || '',
        client_secret: process.env.PAYPAL_CLIENT_SECRET || ''
      }),
      min_amount: 1,
      max_amount: 10000,
      currency: 'USD',
      fees: JSON.stringify({ percentage: 2.9, fixed: 0.30 }),
      processing_time_minutes: 5
    },

    // CREDIT CARD METHODS
    {
      code: 'visa',
      name: 'Visa Card',
      category: 'card',
      description: 'Visa credit and debit cards',
      enabled: true,
      gateway_provider: 'Paystack',
      config: JSON.stringify({
        api_url: process.env.PAYSTACK_API_URL || 'https://api.paystack.co/transaction/initialize',
        api_key: process.env.PAYSTACK_API_KEY || ''
      }),
      min_amount: 100,
      max_amount: 5000000,
      currency: 'ZWL',
      fees: JSON.stringify({ percentage: 1.5, fixed: 0 }),
      processing_time_minutes: 5
    },
    {
      code: 'mastercard',
      name: 'Mastercard',
      category: 'card',
      description: 'Mastercard credit and debit cards',
      enabled: true,
      gateway_provider: 'Paystack',
      config: JSON.stringify({
        api_url: process.env.PAYSTACK_API_URL || 'https://api.paystack.co/transaction/initialize',
        api_key: process.env.PAYSTACK_API_KEY || ''
      }),
      min_amount: 100,
      max_amount: 5000000,
      currency: 'ZWL',
      fees: JSON.stringify({ percentage: 1.5, fixed: 0 }),
      processing_time_minutes: 5
    }
  ]);
};
