const knex = require('./config/database');

async function addCommissionRate() {
  try {
    console.log('Adding commission_rate to vendors table...');
    await knex.raw(`
      ALTER TABLE vendors 
      ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5, 2) DEFAULT 15.00,
      ADD COLUMN IF NOT EXISTS commission_type VARCHAR(20) DEFAULT 'percentage',
      ADD COLUMN IF NOT EXISTS total_commission DECIMAL(15, 2) DEFAULT 0.00;
    `);
    console.log('✓ Successfully added commission fields');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

addCommissionRate();
