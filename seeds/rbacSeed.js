/**
 * Seed script to initialize RBAC system
 * Run with: node ticketing-backend/seeds/rbacSeed.js
 */

const db = require('../config/database');
const RBACService = require('../services/rbacService');

async function seedRBAC() {
  try {
    console.log('🔐 Initializing RBAC system...');

    // Initialize default roles and permissions
    await RBACService.initializeSystemRBAC();

    console.log('✅ RBAC system initialized successfully!');
    console.log('\nCreated system roles:');
    console.log('  • admin (priority: 100) - Full system access');
    console.log('  • organizer (priority: 50) - Event management');
    console.log('  • venue_manager (priority: 40) - Venue management');
    console.log('  • vendor (priority: 30) - Vendor/merchandise');
    console.log('  • customer (priority: 10) - Regular customer');

    // Show permission counts
    const permissions = await RBACService.getAllPermissions();
    console.log(`\nCreated ${permissions.length} system permissions across categories:`);
    
    const categories = {};
    permissions.forEach(p => {
      categories[p.category] = (categories[p.category] || 0) + 1;
    });

    Object.entries(categories).forEach(([cat, count]) => {
      console.log(`  • ${cat}: ${count} permissions`);
    });

    console.log('\n✨ RBAC seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ RBAC seeding failed:', error);
    process.exit(1);
  }
}

seedRBAC();
