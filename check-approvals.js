const db = require('./config/database');

async function checkApprovals() {
  try {
    const users = await db('users')
      .select(
        'id',
        'email',
        'first_name',
        'last_name',
        'role',
        'approval_status',
        'payment_verification_status',
        'created_at'
      )
      .whereIn('role', ['organizer', 'venue_manager', 'vendor'])
      .orderBy('created_at', 'desc')
      .limit(20);

    console.log('\n========== USERS STATUS REPORT ==========\n');
    
    if (users.length === 0) {
      console.log('No organizers, venue managers, or vendors found.');
      process.exit(0);
    }

    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.first_name} ${user.last_name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Approval Status: ${user.approval_status}`);
      console.log(`   Payment Verification: ${user.payment_verification_status}`);
      console.log(`   Created: ${new Date(user.created_at).toLocaleDateString()}`);
      console.log('');
    });

    // Summary
    const approved = users.filter(u => u.approval_status === 'approved');
    const pending = users.filter(u => u.approval_status === 'pending');
    const rejected = users.filter(u => u.approval_status === 'rejected');
    const paymentVerified = users.filter(u => u.payment_verification_status === 'verified');
    
    console.log('========== SUMMARY ==========');
    console.log(`Total Users: ${users.length}`);
    console.log(`  - Approved: ${approved.length}`);
    console.log(`  - Pending: ${pending.length}`);
    console.log(`  - Rejected: ${rejected.length}`);
    console.log(`  - Payment Verified: ${paymentVerified.length}`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkApprovals();
