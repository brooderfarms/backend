const db = require('../config/database');

/**
 * Multi-Language Service
 * Supports English, Spanish, French, Shona for ticketing platform
 */

const SUPPORTED_LANGUAGES = {
  en: {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    direction: 'ltr',
    regions: ['US', 'GB', 'CA', 'AU']
  },
  es: {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    direction: 'ltr',
    regions: ['ES', 'MX', 'AR']
  },
  fr: {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    direction: 'ltr',
    regions: ['FR', 'BE', 'CH']
  },
  sn: {
    code: 'sn',
    name: 'Shona',
    nativeName: 'Shona',
    direction: 'ltr',
    regions: ['ZW']
  }
};

// Language-specific translations
const TRANSLATIONS = {
  en: {
    'common.welcome': 'Welcome',
    'common.login': 'Login',
    'common.register': 'Register',
    'common.logout': 'Logout',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'events.browse': 'Browse Events',
    'events.create': 'Create Event',
    'events.featured': 'Featured Events',
    'tickets.buy': 'Buy Tickets',
    'tickets.transfer': 'Transfer Ticket',
    'payment.process': 'Process Payment',
    'payment.success': 'Payment Successful',
    'error.notFound': 'Page not found'
  },
  es: {
    'common.welcome': 'Bienvenido',
    'common.login': 'Iniciar sesión',
    'common.register': 'Registrarse',
    'common.logout': 'Cerrar sesión',
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'common.delete': 'Eliminar',
    'common.edit': 'Editar',
    'events.browse': 'Explorar Eventos',
    'events.create': 'Crear Evento',
    'events.featured': 'Eventos Destacados',
    'tickets.buy': 'Comprar Entradas',
    'tickets.transfer': 'Transferir Entrada',
    'payment.process': 'Procesar Pago',
    'payment.success': 'Pago Exitoso',
    'error.notFound': 'Página no encontrada'
  },
  fr: {
    'common.welcome': 'Bienvenue',
    'common.login': 'Connexion',
    'common.register': 'S\'inscrire',
    'common.logout': 'Déconnexion',
    'common.save': 'Enregistrer',
    'common.cancel': 'Annuler',
    'common.delete': 'Supprimer',
    'common.edit': 'Modifier',
    'events.browse': 'Parcourir les événements',
    'events.create': 'Créer un événement',
    'events.featured': 'Événements en vedette',
    'tickets.buy': 'Acheter des billets',
    'tickets.transfer': 'Transférer un billet',
    'payment.process': 'Traiter le paiement',
    'payment.success': 'Paiement réussi',
    'error.notFound': 'Page non trouvée'
  },
  sn: {
    'common.welcome': 'Karibai',
    'common.login': 'Pinda',
    'common.register': 'Ndadzoka',
    'common.logout': 'Buda',
    'common.save': 'Chengetedza',
    'common.cancel': 'Anula',
    'common.delete': 'Bvisa',
    'common.edit': 'Shandura',
    'events.browse': 'Ongorora Zvigaro Zvinzvimbo',
    'events.create': 'Gadzira Zvigaro Zvinzvimbo',
    'events.featured': 'Zvigaro Zvinzvimbo Zvinosanganiswa',
    'tickets.buy': 'Tenga Tikiti',
    'tickets.transfer': 'Tenderedza Tikiti',
    'payment.process': 'Yazvino Mutengo',
    'payment.success': 'Mutengo Wakonzwa',
    'error.notFound': 'Peji haisipi'
  }
};

/**
 * Get all supported languages
 * @returns {Array} Language list
 */
async function getSupportedLanguages() {
  try {
    return Object.entries(SUPPORTED_LANGUAGES).map(([code, details]) => ({
      code,
      name: details.name,
      nativeName: details.nativeName,
      direction: details.direction,
      regions: details.regions
    }));
  } catch (error) {
    throw new Error(`Failed to get languages: ${error.message}`);
  }
}

/**
 * Get user's preferred language
 * @param {number} userId - User ID
 * @returns {string} Language code
 */
async function getUserLanguage(userId) {
  try {
    const pref = await db('user_language_preferences')
      .where('user_id', userId)
      .first();

    return pref?.preferred_language || 'en';
  } catch (error) {
    return 'en'; // Default fallback
  }
}

/**
 * Set user's preferred language
 * @param {number} userId - User ID
 * @param {string} language - Language code
 * @returns {Object} Updated preference
 */
async function setUserLanguage(userId, language) {
  try {
    if (!SUPPORTED_LANGUAGES[language]) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const user = await db('users').where('id', userId).first();
    if (!user) {
      throw new Error('User not found');
    }

    const existingPref = await db('user_language_preferences')
      .where('user_id', userId)
      .first();

    if (existingPref) {
      await db('user_language_preferences')
        .where('id', existingPref.id)
        .update({
          preferred_language: language,
          updated_at: new Date()
        });
    } else {
      await db('user_language_preferences').insert({
        user_id: userId,
        preferred_language: language,
        created_at: new Date()
      });
    }

    return {
      userId,
      preferredLanguage: language,
      name: SUPPORTED_LANGUAGES[language].name
    };
  } catch (error) {
    throw new Error(`Failed to set language preference: ${error.message}`);
  }
}

/**
 * Get translation for a key in specific language
 * @param {string} key - Translation key (e.g., 'common.welcome')
 * @param {string} language - Language code
 * @returns {string} Translated text
 */
function getTranslation(key, language = 'en') {
  try {
    const langTranslations = TRANSLATIONS[language] || TRANSLATIONS['en'];
    return langTranslations[key] || key;
  } catch {
    return key;
  }
}

/**
 * Get all translations for a language
 * @param {string} language - Language code
 * @returns {Object} All translations
 */
function getLanguageTranslations(language = 'en') {
  try {
    return TRANSLATIONS[language] || TRANSLATIONS['en'];
  } catch {
    return TRANSLATIONS['en'];
  }
}

/**
 * Add or update translation
 * @param {string} key - Translation key
 * @param {string} language - Language code
 * @param {string} value - Translation value
 * @returns {Object} Updated translation
 */
async function setTranslation(key, language, value) {
  try {
    if (!SUPPORTED_LANGUAGES[language]) {
      throw new Error(`Unsupported language: ${language}`);
    }

    // Store in database for persistence
    const existing = await db('translations')
      .where('key', key)
      .where('language', language)
      .first();

    if (existing) {
      await db('translations')
        .where('id', existing.id)
        .update({
          value,
          updated_at: new Date()
        });
    } else {
      await db('translations').insert({
        key,
        language,
        value,
        created_at: new Date()
      });
    }

    // Update in-memory cache
    if (!TRANSLATIONS[language]) {
      TRANSLATIONS[language] = {};
    }
    TRANSLATIONS[language][key] = value;

    return {
      key,
      language,
      value,
      status: 'updated'
    };
  } catch (error) {
    throw new Error(`Failed to set translation: ${error.message}`);
  }
}

/**
 * Get language-specific event details
 * @param {number} eventId - Event ID
 * @param {string} language - Language code
 * @returns {Object} Event with translations
 */
async function getLocalizedEvent(eventId, language = 'en') {
  try {
    const event = await db('events').where('id', eventId).first();

    if (!event) {
      throw new Error('Event not found');
    }

    // Get localized descriptions if available
    const localized = await db('event_translations')
      .where('event_id', eventId)
      .where('language', language)
      .first();

    return {
      ...event,
      title: localized?.title || event.title,
      description: localized?.description || event.description,
      short_description: localized?.short_description || event.short_description,
      language,
      isLocalized: !!localized
    };
  } catch (error) {
    throw new Error(`Failed to get localized event: ${error.message}`);
  }
}

/**
 * Save event in multiple languages
 * @param {number} eventId - Event ID
 * @param {Object} translations - Translations by language
 * @returns {Object} Save result
 */
async function saveEventTranslations(eventId, translations) {
  try {
    const event = await db('events').where('id', eventId).first();
    if (!event) {
      throw new Error('Event not found');
    }

    // Validate all languages are supported
    Object.keys(translations).forEach(lang => {
      if (!SUPPORTED_LANGUAGES[lang]) {
        throw new Error(`Unsupported language: ${lang}`);
      }
    });

    // Save translations
    for (const [language, data] of Object.entries(translations)) {
      const existing = await db('event_translations')
        .where('event_id', eventId)
        .where('language', language)
        .first();

      if (existing) {
        await db('event_translations')
          .where('id', existing.id)
          .update({
            ...data,
            updated_at: new Date()
          });
      } else {
        await db('event_translations').insert({
          event_id: eventId,
          language,
          ...data,
          created_at: new Date()
        });
      }
    }

    return {
      eventId,
      languagesAdded: Object.keys(translations),
      status: 'success'
    };
  } catch (error) {
    throw new Error(`Failed to save event translations: ${error.message}`);
  }
}

/**
 * Get language statistics
 * @returns {Object} Statistics
 */
async function getLanguageStatistics() {
  try {
    const preferences = await db('user_language_preferences')
      .select(
        'preferred_language',
        db.raw('COUNT(*) as user_count')
      )
      .groupBy('preferred_language');

    const eventTranslations = await db('event_translations')
      .select(
        'language',
        db.raw('COUNT(*) as event_count')
      )
      .groupBy('language');

    return {
      userPreferences: Object.fromEntries(
        preferences.map(p => [p.preferred_language, p.user_count])
      ),
      eventTranslations: Object.fromEntries(
        eventTranslations.map(e => [e.language, e.event_count])
      ),
      supportedLanguages: Object.keys(SUPPORTED_LANGUAGES).length
    };
  } catch (error) {
    throw new Error(`Failed to get language statistics: ${error.message}`);
  }
}

module.exports = {
  getSupportedLanguages,
  getUserLanguage,
  setUserLanguage,
  getTranslation,
  getLanguageTranslations,
  setTranslation,
  getLocalizedEvent,
  saveEventTranslations,
  getLanguageStatistics,
  SUPPORTED_LANGUAGES,
  TRANSLATIONS
};
