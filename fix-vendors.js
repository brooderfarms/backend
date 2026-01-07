const knex = require('./config/database');

async function alterEventId() {
  try {
    console.log('Altering vendors table to make event_id nullable...');
    await knex.raw(`
      ALTER TABLE vendors 
      ALTER COLUMN event_id DROP NOT NULL;
    `);
    console.log('✓ Successfully made event_id nullable');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

alterEventId();
