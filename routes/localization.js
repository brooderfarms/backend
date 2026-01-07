const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { verifyToken } = require('../middleware/auth');
const multiCurrencyService = require('../services/multiCurrencyService');
const multiLanguageService = require('../services/multiLanguageService');
const auditService = require('../services/auditService');

// ===== CURRENCY ROUTES =====

/**
 * GET /api/localization/currencies
 * Get all supported currencies
 */
router.get('/currencies', async (req, res) => {
  try {
    const currencies = await multiCurrencyService.getSupportedCurrencies();
    res.json({ data: currencies, count: currencies.length });
  } catch (error) {
    console.error('Error fetching currencies:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/localization/exchange-rates
 * Get current exchange rates
 * @query {string} base - Base currency (default: USD)
 */
router.get('/exchange-rates', async (req, res) => {
  try {
    const { base = 'USD' } = req.query;

    const rates = await multiCurrencyService.getExchangeRates(base);

    res.json({
      baseCurrency: base,
      rates,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error fetching rates:', error);
    
    if (error.message.includes('Unsupported')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/localization/convert
 * Convert amount between currencies
 * @body {number} amount - Amount to convert
 * @body {string} from - Source currency
 * @body {string} to - Target currency
 */
router.post('/convert', async (req, res) => {
  try {
    const schema = Joi.object({
      amount: Joi.number().required().positive(),
      from: Joi.string().required().length(3).uppercase(),
      to: Joi.string().required().length(3).uppercase()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const result = await multiCurrencyService.convertCurrency(
      value.amount,
      value.from,
      value.to
    );

    res.json(result);
  } catch (error) {
    console.error('Error converting currency:', error);
    
    if (error.message.includes('Unsupported') || error.message.includes('No exchange')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/localization/user/currency
 * Set user's preferred currency
 * @body {string} currency - Currency code
 */
router.post('/user/currency', verifyToken, async (req, res) => {
  try {
    const schema = Joi.object({
      currency: Joi.string().required().length(3).uppercase()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const result = await multiCurrencyService.setUserCurrency(
      req.user.id,
      value.currency
    );

    await auditService.logAction({
      userId: req.user.id,
      action: 'SET_PREFERRED_CURRENCY',
      resourceType: 'user_preference',
      resourceId: req.user.id,
      changes: { currency: value.currency }
    });

    res.json(result);
  } catch (error) {
    console.error('Error setting currency:', error);
    
    if (error.message.includes('Unsupported') || error.message.includes('not found')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/localization/user/currency
 * Get user's preferred currency
 */
router.get('/user/currency', verifyToken, async (req, res) => {
  try {
    const currency = await multiCurrencyService.getUserCurrency(req.user.id);

    res.json({
      userId: req.user.id,
      preferredCurrency: currency,
      details: multiCurrencyService.SUPPORTED_CURRENCIES[currency]
    });
  } catch (error) {
    console.error('Error fetching user currency:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/localization/events/:eventId/pricing
 * Get event pricing in user's preferred currency
 */
router.get('/events/:eventId/pricing', verifyToken, async (req, res) => {
  try {
    const { eventId } = req.params;

    if (isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    const pricing = await multiCurrencyService.getEventPricingForUser(
      parseInt(eventId),
      req.user.id
    );

    res.json(pricing);
  } catch (error) {
    console.error('Error fetching event pricing:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/localization/exchange-rates/update
 * Update exchange rates (admin only)
 * @body {string} baseCurrency - Base currency code
 * @body {Object} rates - Exchange rates object
 */
router.post('/exchange-rates/update', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can update rates' });
    }

    const schema = Joi.object({
      baseCurrency: Joi.string().required().length(3).uppercase(),
      rates: Joi.object().required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const result = await multiCurrencyService.updateExchangeRates(value);

    await auditService.logAction({
      userId: req.user.id,
      action: 'UPDATE_EXCHANGE_RATES',
      resourceType: 'exchange_rates',
      resourceId: value.baseCurrency,
      changes: value.rates
    });

    res.json(result);
  } catch (error) {
    console.error('Error updating rates:', error);
    
    if (error.message.includes('Invalid')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

// ===== LANGUAGE ROUTES =====

/**
 * GET /api/localization/languages
 * Get all supported languages
 */
router.get('/languages', async (req, res) => {
  try {
    const languages = await multiLanguageService.getSupportedLanguages();
    res.json({ data: languages, count: languages.length });
  } catch (error) {
    console.error('Error fetching languages:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/localization/user/language
 * Get user's preferred language
 */
router.get('/user/language', verifyToken, async (req, res) => {
  try {
    const language = await multiLanguageService.getUserLanguage(req.user.id);

    res.json({
      userId: req.user.id,
      preferredLanguage: language,
      details: multiLanguageService.SUPPORTED_LANGUAGES[language]
    });
  } catch (error) {
    console.error('Error fetching user language:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/localization/user/language
 * Set user's preferred language
 * @body {string} language - Language code (en, es, fr, sn)
 */
router.post('/user/language', verifyToken, async (req, res) => {
  try {
    const schema = Joi.object({
      language: Joi.string().required().valid('en', 'es', 'fr', 'sn')
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const result = await multiLanguageService.setUserLanguage(
      req.user.id,
      value.language
    );

    await auditService.logAction({
      userId: req.user.id,
      action: 'SET_PREFERRED_LANGUAGE',
      resourceType: 'user_preference',
      resourceId: req.user.id,
      changes: { language: value.language }
    });

    res.json(result);
  } catch (error) {
    console.error('Error setting language:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/localization/translations/:language
 * Get all translations for a language
 * @param {string} language - Language code
 */
router.get('/translations/:language', async (req, res) => {
  try {
    const { language } = req.params;

    if (!multiLanguageService.SUPPORTED_LANGUAGES[language]) {
      return res.status(400).json({ error: 'Unsupported language' });
    }

    const translations = multiLanguageService.getLanguageTranslations(language);

    res.json({
      language,
      translations,
      count: Object.keys(translations).length
    });
  } catch (error) {
    console.error('Error fetching translations:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/localization/events/:eventId
 * Get localized event details
 * @query {string} lang - Language code (default: en)
 */
router.get('/events/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { lang = 'en' } = req.query;

    if (isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    const event = await multiLanguageService.getLocalizedEvent(
      parseInt(eventId),
      lang
    );

    res.json(event);
  } catch (error) {
    console.error('Error fetching localized event:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/localization/events/:eventId/translations
 * Save event translations
 * @param {number} eventId - Event ID
 * @body {Object} translations - Translations by language
 */
router.post('/events/:eventId/translations', verifyToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const translations = req.body;

    if (isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    // Verify event ownership (organizer)
    const event = await db('events')
      .where('id', parseInt(eventId))
      .where('organizer_id', req.user.id)
      .first();

    if (!event && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const result = await multiLanguageService.saveEventTranslations(
      parseInt(eventId),
      translations
    );

    await auditService.logAction({
      userId: req.user.id,
      action: 'SAVE_EVENT_TRANSLATIONS',
      resourceType: 'event_translation',
      resourceId: parseInt(eventId),
      changes: { languages: Object.keys(translations) }
    });

    res.json(result);
  } catch (error) {
    console.error('Error saving translations:', error);
    
    if (error.message.includes('Unsupported') || error.message.includes('not found')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/localization/statistics
 * Get localization statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    const currencyStats = await multiCurrencyService.getCurrencyStatistics();
    const languageStats = await multiLanguageService.getLanguageStatistics();

    res.json({
      currency: currencyStats,
      language: languageStats,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
