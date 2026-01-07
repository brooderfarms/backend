const { body, param, query, validationResult } = require('express-validator');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// User validation rules
const validateUserRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  body('first_name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('First name is required and must be less than 100 characters'),
  body('last_name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Last name is required and must be less than 100 characters'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  body('role')
    .optional()
    .isIn(['customer', 'organizer', 'venue_manager', 'vendor', 'admin'])
    .withMessage('Invalid role selected'),
  handleValidationErrors
];

const validateUserLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];

const validateUserUpdate = [
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('first_name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('First name must be less than 100 characters'),
  body('last_name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Last name must be less than 100 characters'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  body('address')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Address must be less than 500 characters'),
  handleValidationErrors
];

// Event validation rules
const validateEventCreation = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Event title is required and must be less than 255 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Description must be less than 5000 characters'),
  body('event_type')
    .isIn(['concert', 'sports', 'theater', 'conference', 'festival', 'exhibition', 'bus_trip', 'flight', 'other'])
    .withMessage('Invalid event type'),
  // organizer_id is set by backend based on user role, so validation doesn't require it
  // Only admins can specify it; organizers get their own ID
  body('organizer_id')
    .optional()
    .isUUID()
    .withMessage('Valid organizer ID is required'),
  body('venue_id')
    .isUUID()
    .withMessage('Valid venue ID is required'),
  body('start_date')
    .isISO8601()
    .withMessage('Valid start date is required')
    .custom((value, { req }) => {
      if (new Date(value) <= new Date()) {
        throw new Error('Start date must be in the future');
      }
      return true;
    }),
  body('end_date')
    .isISO8601()
    .withMessage('Valid end date is required')
    .custom((value, { req }) => {
      if (new Date(value) <= new Date(req.body.start_date)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
  body('base_price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Base price must be a positive number'),
  body('total_capacity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Total capacity must be a positive integer'),
  handleValidationErrors
];

const validateEventUpdate = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Event title must be less than 255 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Description must be less than 5000 characters'),
  body('event_type')
    .optional()
    .isIn(['concert', 'sports', 'theater', 'conference', 'festival', 'exhibition', 'bus_trip', 'flight', 'other'])
    .withMessage('Invalid event type'),
  body('start_date')
    .optional()
    .isISO8601()
    .withMessage('Valid start date is required'),
  body('end_date')
    .optional()
    .isISO8601()
    .withMessage('Valid end date is required')
    .custom((value, { req }) => {
      if (req.body.start_date && new Date(value) <= new Date(req.body.start_date)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
  body('base_price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Base price must be a positive number'),
  body('total_capacity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Total capacity must be a positive integer'),
  handleValidationErrors
];

// Ticket validation rules
const validateTicketPurchase = [
  body('event_id')
    .isUUID()
    .withMessage('Valid event ID is required'),
  body('ticket_type')
    .isIn(['standard', 'vip', 'premium', 'economy', 'business', 'first_class'])
    .withMessage('Invalid ticket type'),
  body('ticket_format')
    .isIn(['digital', 'physical'])
    .withMessage('Invalid ticket format'),
  body('quantity')
    .isInt({ min: 1, max: 10 })
    .withMessage('Quantity must be between 1 and 10'),
  body('seat_numbers')
    .optional()
    .isArray()
    .withMessage('Seat numbers must be an array'),
  body('seat_numbers.*')
    .optional()
    .isString()
    .withMessage('Each seat number must be a string'),
  handleValidationErrors
];

// Payment validation rules
const validatePayment = [
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  body('currency')
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be 3 characters'),
  body('payment_method')
    .isIn(['stripe', 'paypal', 'zim_gateway', 'mastercard', 'visa', 'bank_transfer', 'cash'])
    .withMessage('Invalid payment method'),
  body('gateway')
    .isIn(['stripe', 'paypal', 'zim_gateway', 'other'])
    .withMessage('Invalid payment gateway'),
  handleValidationErrors
];

// Venue validation rules
const validateVenueCreation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Venue name is required and must be less than 255 characters'),
  body('address')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Address is required and must be less than 500 characters'),
  body('city')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('City is required and must be less than 100 characters'),
  body('venue_type')
    .isIn(['stadium', 'theater', 'arena', 'concert_hall', 'sports_complex', 'conference_center', 'airport', 'bus_station', 'other'])
    .withMessage('Invalid venue type'),
  body('capacity')
    .isInt({ min: 1 })
    .withMessage('Capacity must be a positive integer'),
  body('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  handleValidationErrors
];

// UUID parameter validation
const validateUUID = [
  param('id')
    .isUUID()
    .withMessage('Valid UUID is required'),
  handleValidationErrors
];

// Query parameter validation
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('sort_by')
    .optional()
    .isString()
    .withMessage('Sort by must be a string'),
  query('sort_order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),
  handleValidationErrors
];

module.exports = {
  validateUserRegistration,
  validateUserLogin,
  validateUserUpdate,
  validateEventCreation,
  validateEventUpdate,
  validateTicketPurchase,
  validatePayment,
  validateVenueCreation,
  validateUUID,
  validatePagination,
  handleValidationErrors
};
