const db = require('../config/database');

/**
 * Multi-Currency Service
 * Supports USD, ZWL, GBP, EUR with real-time exchange rates
 * Includes user currency preferences and dynamic conversion
 */

const SUPPORTED_CURRENCIES = {
  USD: {
    name: 'US Dollar',
    symbol: '$',
    code: 'USD',
    decimalPlaces: 2,
    countries: ['US'],
    gateway: 'stripe'
  },
  ZWL: {
    name: 'Zimbabwean Dollar',
    symbol: '$',
    code: 'ZWL',
    decimalPlaces: 2,
    countries: ['ZW'],
    gateway: 'zimswitch'
  },
  GBP: {
    name: 'British Pound',
    symbol: '£',
    code: 'GBP',
    decimalPlaces: 2,
    countries: ['GB'],
    gateway: 'stripe'
  },
  EUR: {
    name: 'Euro',
    symbol: '€',
    code: 'EUR',
    decimalPlaces: 2,
    countries: ['FR', 'DE', 'IT', 'ES'],
    gateway: 'stripe'
  },
  ZAR: {
    name: 'South African Rand',
    symbol: 'R',
    code: 'ZAR',
    decimalPlaces: 2,
    countries: ['ZA'],
    gateway: 'stripe'
  }
};

// Default exchange rates (will be updated via provider)
const DEFAULT_RATES = {
  USD: 1,
  ZWL: 350, // 1 USD = 350 ZWL
  GBP: 0.79,
  EUR: 0.92,
  ZAR: 18.5
};

/**
 * Get all supported currencies
 * @returns {Array} List of currencies
 */
async function getSupportedCurrencies() {
  try {
    return Object.entries(SUPPORTED_CURRENCIES).map(([code, details]) => ({
      code,
      name: details.name,
      symbol: details.symbol,
      decimalPlaces: details.decimalPlaces,
      countries: details.countries
    }));
  } catch (error) {
    throw new Error(`Failed to get currencies: ${error.message}`);
  }
}

/**
 * Get current exchange rates
 * @param {string} baseCurrency - Base currency code (default: USD)
 * @returns {Object} Exchange rates
 */
async function getExchangeRates(baseCurrency = 'USD') {
  try {
    if (!SUPPORTED_CURRENCIES[baseCurrency]) {
      throw new Error(`Unsupported base currency: ${baseCurrency}`);
    }

    // Try to get fresh rates from cache first
    const cachedRates = await db('exchange_rates')
      .where('base_currency', baseCurrency)
      .where('updated_at', '>', db.raw('NOW() - INTERVAL 1 HOUR'))
      .first();

    if (cachedRates) {
      return JSON.parse(cachedRates.rates);
    }

    // If no fresh cache, return default rates
    // In production, this would call an API like OpenExchangeRates or FIXER
    const rates = {};
    const baseRate = DEFAULT_RATES[baseCurrency] || 1;

    Object.entries(DEFAULT_RATES).forEach(([currency, rate]) => {
      rates[currency] = parseFloat((rate / baseRate).toFixed(6));
    });

    // Cache the rates
    await db('exchange_rates').insert({
      base_currency: baseCurrency,
      rates: JSON.stringify(rates),
      updated_at: new Date()
    }).onConflict('base_currency').merge();

    return rates;
  } catch (error) {
    throw new Error(`Failed to get exchange rates: ${error.message}`);
  }
}

/**
 * Convert amount between currencies
 * @param {number} amount - Amount to convert
 * @param {string} fromCurrency - Source currency
 * @param {string} toCurrency - Target currency
 * @returns {Object} Converted amount and rate used
 */
async function convertCurrency(amount, fromCurrency, toCurrency) {
  try {
    if (!SUPPORTED_CURRENCIES[fromCurrency]) {
      throw new Error(`Unsupported source currency: ${fromCurrency}`);
    }

    if (!SUPPORTED_CURRENCIES[toCurrency]) {
      throw new Error(`Unsupported target currency: ${toCurrency}`);
    }

    if (fromCurrency === toCurrency) {
      return {
        original: amount,
        converted: amount,
        fromCurrency,
        toCurrency,
        rate: 1,
        fee: 0
      };
    }

    // Get exchange rates
    const rates = await getExchangeRates(fromCurrency);
    const rate = rates[toCurrency];

    if (!rate) {
      throw new Error(`No exchange rate found for ${fromCurrency} to ${toCurrency}`);
    }

    // Apply conversion with small fee for international transactions
    const conversionFee = fromCurrency !== 'USD' ? 0.02 : 0; // 2% fee for non-USD conversions
    const converted = parseFloat((amount * rate * (1 - conversionFee)).toFixed(2));
    const feeAmount = amount * rate * conversionFee;

    return {
      original: amount,
      converted: converted,
      fromCurrency,
      toCurrency,
      rate: parseFloat(rate.toFixed(6)),
      fee: parseFloat(feeAmount.toFixed(2)),
      feePercentage: conversionFee * 100
    };
  } catch (error) {
    throw new Error(`Currency conversion failed: ${error.message}`);
  }
}

/**
 * Set user's preferred currency
 * @param {number} userId - User ID
 * @param {string} currency - Currency code
 * @returns {Object} Updated preference
 */
async function setUserCurrency(userId, currency) {
  try {
    if (!SUPPORTED_CURRENCIES[currency]) {
      throw new Error(`Unsupported currency: ${currency}`);
    }

    const user = await db('users').where('id', userId).first();
    if (!user) {
      throw new Error('User not found');
    }

    // Check if preference exists
    const existingPref = await db('user_currency_preferences')
      .where('user_id', userId)
      .first();

    if (existingPref) {
      await db('user_currency_preferences')
        .where('id', existingPref.id)
        .update({
          preferred_currency: currency,
          updated_at: new Date()
        });
    } else {
      await db('user_currency_preferences').insert({
        user_id: userId,
        preferred_currency: currency,
        created_at: new Date()
      });
    }

    return {
      userId,
      preferredCurrency: currency,
      message: `Currency preference set to ${SUPPORTED_CURRENCIES[currency].name}`
    };
  } catch (error) {
    throw new Error(`Failed to set currency preference: ${error.message}`);
  }
}

/**
 * Get user's preferred currency
 * @param {number} userId - User ID
 * @returns {string} Currency code
 */
async function getUserCurrency(userId) {
  try {
    const pref = await db('user_currency_preferences')
      .where('user_id', userId)
      .first();

    return pref?.preferred_currency || 'USD';
  } catch (error) {
    return 'USD'; // Default fallback
  }
}

/**
 * Format currency amount
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code
 * @returns {string} Formatted string (e.g., "$100.00")
 */
function formatCurrency(amount, currency = 'USD') {
  try {
    const config = SUPPORTED_CURRENCIES[currency];
    if (!config) {
      return `${amount.toFixed(2)} ${currency}`;
    }

    const formatted = parseFloat(amount).toFixed(config.decimalPlaces);
    return `${config.symbol}${formatted}`;
  } catch {
    return `${amount} ${currency}`;
  }
}

/**
 * Get event pricing in user's preferred currency
 * @param {number} eventId - Event ID
 * @param {number} userId - User ID
 * @returns {Object} Pricing details
 */
async function getEventPricingForUser(eventId, userId) {
  try {
    const event = await db('events')
      .where('id', eventId)
      .first();

    if (!event) {
      throw new Error('Event not found');
    }

    const userCurrency = await getUserCurrency(userId);

    if (event.currency === userCurrency) {
      return {
        eventId,
        originalPrice: event.base_price,
        originalCurrency: event.currency,
        userPrice: event.base_price,
        userCurrency: userCurrency,
        conversionRate: 1,
        conversionFee: 0
      };
    }

    const conversion = await convertCurrency(
      event.base_price,
      event.currency,
      userCurrency
    );

    return {
      eventId,
      originalPrice: event.base_price,
      originalCurrency: event.currency,
      userPrice: conversion.converted,
      userCurrency: userCurrency,
      conversionRate: conversion.rate,
      conversionFee: conversion.fee,
      displayPrice: formatCurrency(conversion.converted, userCurrency)
    };
  } catch (error) {
    throw new Error(`Failed to get event pricing: ${error.message}`);
  }
}

/**
 * Update exchange rates from external provider
 * In production, call OpenExchangeRates, FIXER, or similar API
 * @param {Object} ratesData - Exchange rates data
 * @returns {Object} Update result
 */
async function updateExchangeRates(ratesData) {
  try {
    const { baseCurrency, rates } = ratesData;

    if (!SUPPORTED_CURRENCIES[baseCurrency]) {
      throw new Error(`Invalid base currency: ${baseCurrency}`);
    }

    // Validate rate structure
    Object.keys(rates).forEach(currency => {
      if (!SUPPORTED_CURRENCIES[currency]) {
        throw new Error(`Invalid currency in rates: ${currency}`);
      }
    });

    // Store in database
    await db('exchange_rates').insert({
      base_currency: baseCurrency,
      rates: JSON.stringify(rates),
      updated_at: new Date()
    }).onConflict('base_currency').merge();

    // Log update
    await db('audit_logs').insert({
      action: 'UPDATE_EXCHANGE_RATES',
      resource_type: 'exchange_rates',
      resource_id: baseCurrency,
      changes: rates,
      created_at: new Date()
    });

    return {
      status: 'success',
      baseCurrency,
      ratesUpdated: Object.keys(rates).length,
      timestamp: new Date()
    };
  } catch (error) {
    throw new Error(`Failed to update rates: ${error.message}`);
  }
}

/**
 * Get currency statistics
 * @returns {Object} Statistics
 */
async function getCurrencyStatistics() {
  try {
    const stats = await db('payments')
      .select(
        'currency',
        db.raw('COUNT(*) as transaction_count'),
        db.raw('SUM(amount) as total_amount')
      )
      .groupBy('currency');

    const preferences = await db('user_currency_preferences')
      .select(
        'preferred_currency',
        db.raw('COUNT(*) as user_count')
      )
      .groupBy('preferred_currency');

    return {
      transactionsByC: Object.fromEntries(
        stats.map(s => [s.currency, { count: s.transaction_count, total: s.total_amount }])
      ),
      userPreferences: Object.fromEntries(
        preferences.map(p => [p.preferred_currency, p.user_count])
      ),
      supportedCurrencies: Object.keys(SUPPORTED_CURRENCIES).length
    };
  } catch (error) {
    throw new Error(`Failed to get currency statistics: ${error.message}`);
  }
}

module.exports = {
  getSupportedCurrencies,
  getExchangeRates,
  convertCurrency,
  setUserCurrency,
  getUserCurrency,
  formatCurrency,
  getEventPricingForUser,
  updateExchangeRates,
  getCurrencyStatistics,
  SUPPORTED_CURRENCIES
};
