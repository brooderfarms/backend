/**
 * Migration: Add payment method columns to users table
 * Purpose: Support multiple payment methods (ecocash, innbucks, cash pickup)
 */

exports.up = async (knex) => {
  return knex.schema.table('users', (table) => {
    // Add payment method column
    table.string('payment_method').defaultTo('bank').comment('Payment method: bank, ecocash, innbucks, cash');
    
    // Add Ecocash payment details
    table.string('ecocash_number').nullable().comment('Ecocash phone number for payouts');
    
    // Add Innbucks payment details
    table.string('innbucks_number').nullable().comment('Innbucks phone number for payouts');
    
    // Add Cash pickup details
    table.text('cash_pickup_location').nullable().comment('Location for cash pickup payouts');
    table.text('cash_pickup_details').nullable().comment('Detailed instructions for cash pickup');
  });
};

exports.down = async (knex) => {
  return knex.schema.table('users', (table) => {
    table.dropColumn('payment_method');
    table.dropColumn('ecocash_number');
    table.dropColumn('innbucks_number');
    table.dropColumn('cash_pickup_location');
    table.dropColumn('cash_pickup_details');
  });
};
