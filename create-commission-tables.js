const knex = require('./config/database');

async function createCommissionTables() {
  try {
    console.log('Creating commission_transactions table...');
    
    // Create commission_transactions table
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS commission_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vendor_id UUID NOT NULL REFERENCES vendors(id),
        order_id UUID,
        product_id UUID,
        sale_amount DECIMAL(15, 2) NOT NULL,
        commission_rate DECIMAL(5, 2) NOT NULL,
        commission_amount DECIMAL(15, 2) NOT NULL,
        commission_type VARCHAR(20) DEFAULT 'percentage',
        status VARCHAR(50) DEFAULT 'pending',
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id)
      );
    `);

    console.log('✓ commission_transactions table created');

    // Create vendor_payouts table
    console.log('Creating vendor_payouts table...');
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS vendor_payouts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vendor_id UUID NOT NULL REFERENCES vendors(id),
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        gross_revenue DECIMAL(15, 2) DEFAULT 0,
        total_commissions DECIMAL(15, 2) DEFAULT 0,
        net_revenue DECIMAL(15, 2) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'pending',
        paid_at TIMESTAMP,
        payment_method VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id)
      );
    `);

    console.log('✓ vendor_payouts table created');

    // Create vendor_commission_reports table
    console.log('Creating vendor_commission_reports table...');
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS vendor_commission_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vendor_id UUID NOT NULL REFERENCES vendors(id),
        report_month DATE NOT NULL,
        total_sales DECIMAL(15, 2) DEFAULT 0,
        total_commission_charged DECIMAL(15, 2) DEFAULT 0,
        transaction_count INTEGER DEFAULT 0,
        average_commission_rate DECIMAL(5, 2),
        report_generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id),
        UNIQUE(vendor_id, report_month)
      );
    `);

    console.log('✓ vendor_commission_reports table created');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

createCommissionTables();
