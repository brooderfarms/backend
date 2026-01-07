#!/usr/bin/env node

/**
 * Script to add default elements to existing ticket templates
 * Usage: node scripts/add-default-template-elements.js
 */

const db = require('../config/database');

const DEFAULT_ELEMENTS = [
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

async function addDefaultElements() {
  try {
    console.log('🔍 Finding templates without elements...');

    // Get all templates without elements
    const templates = await db('ticket_templates')
      .whereNull('deleted_at')
      .where(function() {
        this.whereNull('elements')
            .orWhere(db.raw(`elements::text = '[]'`))
            .orWhere(db.raw(`elements::text = ''`))
            .orWhere(db.raw(`elements::text = 'null'`));
      });

    if (templates.length === 0) {
      console.log('✓ All templates already have elements!');
      process.exit(0);
    }

    console.log(`Found ${templates.length} template(s) without elements`);
    console.log('');

    // Update each template
    let updated = 0;
    for (const template of templates) {
      const elements = [...DEFAULT_ELEMENTS];
      await db('ticket_templates').where('id', template.id).update({
        elements: JSON.stringify(elements),
        updated_at: new Date()
      });

      console.log(`✓ Updated: ${template.name} (${template.id})`);
      updated++;
    }

    console.log('');
    console.log(`✅ Successfully added default elements to ${updated} template(s)!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

addDefaultElements();
