const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, requireRole } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// Helper function to ensure elements is always an array
const parseElements = (elements) => {
  if (!elements) return [];
  if (typeof elements === 'string') {
    try {
      return JSON.parse(elements);
    } catch (e) {
      return [];
    }
  }
  if (Array.isArray(elements)) return elements;
  return [];
};

// Helper function to parse digital_format (can be array or string)
const parseDigitalFormat = (format) => {
  if (!format) return ['qr_code'];
  if (Array.isArray(format)) return format;
  if (typeof format === 'string') {
    try {
      const parsed = JSON.parse(format);
      return Array.isArray(parsed) ? parsed : [format];
    } catch (e) {
      return [format];
    }
  }
  return ['qr_code'];
};

// GET all ticket templates for the authenticated organizer
router.get('/', verifyToken, async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { page = 1, limit = 10, search, is_active } = req.query;

    const offset = (page - 1) * limit;

    let query = db('ticket_templates')
      .where('organizer_id', userId)
      .whereNull('deleted_at');

    if (search) {
      query = query.where(function() {
        this.where('name', 'ilike', `%${search}%`)
          .orWhere('description', 'ilike', `%${search}%`);
      });
    }

    if (is_active !== undefined) {
      query = query.where('is_active', is_active === 'true');
    }

    const templates = await query
      .select('*')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    // Ensure elements is always an array for each template
    templates.forEach(template => {
      template.elements = parseElements(template.elements);
      template.digital_format = parseDigitalFormat(template.digital_format);
    });

    const countQuery = db('ticket_templates')
      .where('organizer_id', userId)
      .whereNull('deleted_at');

    if (search) {
      countQuery.where(function() {
        this.where('name', 'ilike', `%${search}%`)
          .orWhere('description', 'ilike', `%${search}%`);
      });
    }

    const { count } = await countQuery.count('* as count').first();

    res.json({
      success: true,
      data: templates,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(count),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    console.error('Get ticket templates error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch ticket templates' 
    });
  }
});

// GET single ticket template
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;

    const template = await db('ticket_templates')
      .where('id', id)
      .where('organizer_id', userId)
      .whereNull('deleted_at')
      .first();

    if (!template) {
      return res.status(404).json({ error: 'Ticket template not found' });
    }

    // Ensure elements is always an array
    template.elements = parseElements(template.elements);
    template.digital_format = parseDigitalFormat(template.digital_format);

    res.json({ success: true, data: template });
  } catch (err) {
    console.error('Get ticket template error:', err);
    res.status(500).json({ error: 'Failed to fetch ticket template' });
  }
});

// CREATE new ticket template
router.post('/', verifyToken, async (req, res) => {
  try {
    const { id: userId } = req.user;
    const {
      name,
      description,
      ticket_type,
      ticket_format,
      digital_format,
      base_price,
      currency,
      service_fee,
      is_transferable,
      is_refundable,
      validity_days,
      seat_restrictions,
      metadata,
      background_color,
      background_image,
      elements
    } = req.body;

    // Validation
    if (!name || base_price === undefined || base_price === null) {
      return res.status(400).json({ error: 'Name and base price are required' });
    }

    // Helper to safely stringify JSON
    const safeStringify = (data) => {
      if (!data) return null;
      if (typeof data === 'string') return data;
      try {
        return JSON.stringify(data);
      } catch (e) {
        console.error('Stringify error:', e);
        return JSON.stringify({});
      }
    };

    const templateId = uuidv4();
    
    // Handle digital_format as array
    let digitalFormatValue = 'qr_code';
    if (digital_format) {
      if (Array.isArray(digital_format)) {
        digitalFormatValue = safeStringify(digital_format);
      } else if (typeof digital_format === 'string') {
        digitalFormatValue = safeStringify(digital_format.split(',').map(f => f.trim()));
      }
    }
    
    const template = {
      id: templateId,
      organizer_id: userId,
      name,
      description: description || null,
      ticket_type: ticket_type || 'standard',
      ticket_format: ticket_format || 'digital',
      digital_format: digitalFormatValue,
      base_price: parseFloat(base_price),
      currency: currency || 'USD',
      service_fee: parseFloat(service_fee || 0),
      is_transferable: is_transferable !== false,
      is_refundable: is_refundable !== false,
      validity_days: validity_days || null,
      seat_restrictions: seat_restrictions || null,
      metadata: safeStringify(metadata),
      background_color: background_color || '#ffffff',
      background_image: background_image || null,
      elements: safeStringify(elements || []),
      is_active: true
    };

    await db('ticket_templates').insert(template);
    const createdTemplate = await db('ticket_templates').where('id', templateId).first();

    res.status(201).json({ success: true, data: createdTemplate });
  } catch (err) {
    console.error('Create ticket template error:', err);
    res.status(500).json({ error: 'Failed to create ticket template', details: err.message });
  }
});

// UPDATE ticket template
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;

    // Verify ownership
    const template = await db('ticket_templates')
      .where('id', id)
      .where('organizer_id', userId)
      .whereNull('deleted_at')
      .first();

    if (!template) {
      return res.status(404).json({ error: 'Ticket template not found' });
    }

    const {
      name,
      description,
      ticket_type,
      ticket_format,
      digital_format,
      base_price,
      currency,
      service_fee,
      is_transferable,
      is_refundable,
      validity_days,
      seat_restrictions,
      metadata,
      is_active,
      background_color,
      background_image,
      elements
    } = req.body;

    // Helper to safely stringify JSON
    const safeStringify = (data) => {
      if (!data) return null;
      if (typeof data === 'string') return data;
      try {
        return JSON.stringify(data);
      } catch (e) {
        console.error('Stringify error:', e);
        return JSON.stringify({});
      }
    };

    const updates = {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(ticket_type && { ticket_type }),
      ...(ticket_format && { ticket_format }),
      ...(digital_format !== undefined && { 
        digital_format: Array.isArray(digital_format) 
          ? safeStringify(digital_format) 
          : (typeof digital_format === 'string' && digital_format.includes(',')
              ? safeStringify(digital_format.split(',').map(f => f.trim()))
              : digital_format)
      }),
      ...(base_price && { base_price }),
      ...(currency && { currency }),
      ...(service_fee !== undefined && { service_fee }),
      ...(is_transferable !== undefined && { is_transferable }),
      ...(is_refundable !== undefined && { is_refundable }),
      ...(validity_days !== undefined && { validity_days }),
      ...(seat_restrictions !== undefined && { seat_restrictions }),
      ...(metadata !== undefined && { metadata: safeStringify(metadata) }),
      ...(is_active !== undefined && { is_active }),
      ...(background_color !== undefined && { background_color }),
      ...(background_image !== undefined && { background_image }),
      ...(elements !== undefined && { elements: safeStringify(elements) }),
      updated_at: new Date()
    };

    await db('ticket_templates').where('id', id).update(updates);
    const updatedTemplate = await db('ticket_templates').where('id', id).first();

    res.json({ success: true, data: updatedTemplate });
  } catch (err) {
    console.error('Update ticket template error:', err);
    res.status(500).json({ error: 'Failed to update ticket template' });
  }
});

// DELETE (soft delete) ticket template
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;

    // Verify ownership
    const template = await db('ticket_templates')
      .where('id', id)
      .where('organizer_id', userId)
      .whereNull('deleted_at')
      .first();

    if (!template) {
      return res.status(404).json({ error: 'Ticket template not found' });
    }

    await db('ticket_templates').where('id', id).update({
      deleted_at: new Date()
    });

    res.json({ success: true, message: 'Ticket template deleted' });
  } catch (err) {
    console.error('Delete ticket template error:', err);
    res.status(500).json({ error: 'Failed to delete ticket template' });
  }
});

// Add default elements to a template
router.post('/:id/add-default-elements', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;

    // Verify ownership
    const template = await db('ticket_templates')
      .where('id', id)
      .where('organizer_id', userId)
      .whereNull('deleted_at')
      .first();

    if (!template) {
      return res.status(404).json({ error: 'Ticket template not found' });
    }

    // Create default elements
    const defaultElements = [
      {
        id: `element-${Date.now()}-1`,
        type: 'logo',
        label: 'Logo/Image',
        config: {
          width: 120,
          height: 80,
          alignment: 'center',
          borderRadius: 4,
          shadow: 'light'
        }
      },
      {
        id: `element-${Date.now()}-2`,
        type: 'event-title',
        label: 'Event Title',
        config: {
          width: 300,
          height: 60,
          fontSize: 28,
          fontWeight: 'bold',
          color: '#ffffff',
          alignment: 'center',
          backgroundColor: '#1a1a2e',
          borderRadius: 4,
          shadow: 'medium'
        }
      },
      {
        id: `element-${Date.now()}-3`,
        type: 'divider',
        label: 'Divider Line',
        config: {
          lineWidth: 2,
          lineLength: 80,
          borderStyle: 'solid',
          borderColor: '#FFD700',
          shadow: 'light'
        }
      },
      {
        id: `element-${Date.now()}-4`,
        type: 'event-info',
        label: 'Event Info',
        config: {
          width: 300,
          height: 80,
          fontSize: 14,
          color: '#333333',
          alignment: 'left',
          backgroundColor: '#f5f5f5',
          borderRadius: 2
        }
      },
      {
        id: `element-${Date.now()}-5`,
        type: 'spacer',
        label: 'Spacer',
        config: {
          height: 15
        }
      },
      {
        id: `element-${Date.now()}-6`,
        type: 'qr-code',
        label: 'QR Code',
        config: {
          qrSize: 'large',
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: '#000000',
          borderRadius: 4,
          shadow: 'medium'
        }
      },
      {
        id: `element-${Date.now()}-7`,
        type: 'spacer',
        label: 'Spacer',
        config: {
          height: 10
        }
      },
      {
        id: `element-${Date.now()}-8`,
        type: 'attendee-info',
        label: 'Attendee Info',
        config: {
          width: 300,
          height: 70,
          fontSize: 13,
          color: '#000000',
          alignment: 'center'
        }
      },
      {
        id: `element-${Date.now()}-9`,
        type: 'ticket-info',
        label: 'Ticket Info',
        config: {
          width: 300,
          height: 50,
          fontSize: 14,
          fontWeight: 'bold',
          color: '#FFD700',
          alignment: 'center'
        }
      },
      {
        id: `element-${Date.now()}-10`,
        type: 'extra-fields',
        label: 'Custom Fields',
        config: {
          width: 300,
          height: 40,
          fontSize: 12,
          color: '#666666',
          alignment: 'center',
          customText: 'ADMIT ONE'
        }
      }
    ];

    // Update template with default elements
    await db('ticket_templates').where('id', id).update({
      elements: JSON.stringify(defaultElements),
      updated_at: new Date()
    });

    const updatedTemplate = await db('ticket_templates').where('id', id).first();
    updatedTemplate.elements = defaultElements;

    res.json({ 
      success: true, 
      message: 'Default elements added to template',
      data: updatedTemplate 
    });
  } catch (err) {
    console.error('Add default elements error:', err);
    res.status(500).json({ error: 'Failed to add default elements' });
  }
});

// Add default elements to ALL templates without elements
router.post('/admin/add-defaults-to-all', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    // Get all templates without elements
    const templatesWithoutElements = await db('ticket_templates')
      .whereNull('deleted_at')
      .whereRaw(`(elements IS NULL OR elements = '[]' OR elements = '')`);

    if (templatesWithoutElements.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No templates need default elements',
        updated: 0
      });
    }

    // Create default elements
    const createDefaultElements = () => [
      {
        id: `element-${Date.now()}-1`,
        type: 'logo',
        label: 'Logo/Image',
        config: {
          width: 120,
          height: 80,
          alignment: 'center',
          borderRadius: 4,
          shadow: 'light'
        }
      },
      {
        id: `element-${Date.now()}-2`,
        type: 'event-title',
        label: 'Event Title',
        config: {
          width: 300,
          height: 60,
          fontSize: 28,
          fontWeight: 'bold',
          color: '#ffffff',
          alignment: 'center',
          backgroundColor: '#1a1a2e',
          borderRadius: 4,
          shadow: 'medium'
        }
      },
      {
        id: `element-${Date.now()}-3`,
        type: 'divider',
        label: 'Divider Line',
        config: {
          lineWidth: 2,
          lineLength: 80,
          borderStyle: 'solid',
          borderColor: '#FFD700',
          shadow: 'light'
        }
      },
      {
        id: `element-${Date.now()}-4`,
        type: 'event-info',
        label: 'Event Info',
        config: {
          width: 300,
          height: 80,
          fontSize: 14,
          color: '#333333',
          alignment: 'left',
          backgroundColor: '#f5f5f5',
          borderRadius: 2
        }
      },
      {
        id: `element-${Date.now()}-5`,
        type: 'spacer',
        label: 'Spacer',
        config: {
          height: 15
        }
      },
      {
        id: `element-${Date.now()}-6`,
        type: 'qr-code',
        label: 'QR Code',
        config: {
          qrSize: 'large',
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: '#000000',
          borderRadius: 4,
          shadow: 'medium'
        }
      },
      {
        id: `element-${Date.now()}-7`,
        type: 'spacer',
        label: 'Spacer',
        config: {
          height: 10
        }
      },
      {
        id: `element-${Date.now()}-8`,
        type: 'attendee-info',
        label: 'Attendee Info',
        config: {
          width: 300,
          height: 70,
          fontSize: 13,
          color: '#000000',
          alignment: 'center'
        }
      },
      {
        id: `element-${Date.now()}-9`,
        type: 'ticket-info',
        label: 'Ticket Info',
        config: {
          width: 300,
          height: 50,
          fontSize: 14,
          fontWeight: 'bold',
          color: '#FFD700',
          alignment: 'center'
        }
      },
      {
        id: `element-${Date.now()}-10`,
        type: 'extra-fields',
        label: 'Custom Fields',
        config: {
          width: 300,
          height: 40,
          fontSize: 12,
          color: '#666666',
          alignment: 'center',
          customText: 'ADMIT ONE'
        }
      }
    ];

    // Update all templates
    let updated = 0;
    for (const template of templatesWithoutElements) {
      const defaultElements = createDefaultElements();
      await db('ticket_templates').where('id', template.id).update({
        elements: JSON.stringify(defaultElements),
        updated_at: new Date()
      });
      updated++;
    }

    res.json({ 
      success: true, 
      message: `Added default elements to ${updated} template(s)`,
      updated
    });
  } catch (err) {
    console.error('Add defaults to all templates error:', err);
    res.status(500).json({ error: 'Failed to add default elements', details: err.message });
  }
});

module.exports = router;
