const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const db = require('../config/database');

// Generate unique NFC card number
function generateCardNumber() {
  return 'NFC' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
}

// Generate unique card UID (simulated - in production this comes from physical card)
function generateCardUID() {
  return 'UID' + Math.random().toString(36).substr(2, 12).toUpperCase();
}

// ============== Purchase NFC/RFID Card ==============
router.post('/purchase', verifyToken, async (req, res) => {
  try {
    const { card_type = 'nfc', initial_balance = 0 } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!['nfc', 'rfid'].includes(card_type)) {
      return res.status(400).json({ error: 'Invalid card type' });
    }

    if (initial_balance < 0) {
      return res.status(400).json({ error: 'Invalid balance' });
    }

    // Create card record
    const [cardId] = await db('nfc_cards').insert({
      unique_id: generateCardUID(),
      card_number: generateCardNumber(),
      card_type,
      user_id: userId,
      balance: initial_balance,
      status: 'inactive',
      metadata: JSON.stringify({ 
        purchased_date: new Date().toISOString(),
        initial_balance 
      })
    });

    // Log transaction
    await db('nfc_card_transactions').insert({
      nfc_card_id: cardId,
      transaction_type: 'purchase',
      amount: initial_balance,
      balance_after: initial_balance,
      status: 'completed'
    });

    // Fetch created card
    const card = await db('nfc_cards').where('id', cardId).first();

    res.status(201).json({
      success: true,
      message: `${card_type.toUpperCase()} card purchased successfully`,
      card: {
        id: card.id,
        card_number: card.card_number,
        card_type: card.card_type,
        balance: card.balance,
        status: card.status,
        created_at: card.created_at
      }
    });
  } catch (error) {
    console.error('Error purchasing NFC card:', error);
    res.status(500).json({ error: 'Failed to purchase card' });
  }
});

// ============== Get User's NFC Cards ==============
router.get('/my-cards', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const cards = await db('nfc_cards')
      .where('user_id', userId)
      .orderBy('created_at', 'desc');

    // Get transaction history for each card
    const cardsWithHistory = await Promise.all(
      cards.map(async (card) => {
        const transactions = await db('nfc_card_transactions')
          .where('nfc_card_id', card.id)
          .orderBy('created_at', 'desc')
          .limit(10);

        return {
          ...card,
          metadata: card.metadata ? JSON.parse(card.metadata) : null,
          recent_transactions: transactions
        };
      })
    );

    res.json({
      success: true,
      cards: cardsWithHistory,
      total: cardsWithHistory.length
    });
  } catch (error) {
    console.error('Error fetching NFC cards:', error);
    res.status(500).json({ error: 'Failed to fetch cards' });
  }
});

// ============== Activate Card ==============
router.post('/:cardId/activate', verifyToken, async (req, res) => {
  try {
    const { cardId } = req.params;
    const userId = req.user.id;

    // Verify card belongs to user
    const card = await db('nfc_cards')
      .where('id', cardId)
      .where('user_id', userId)
      .first();

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    if (card.status === 'active') {
      return res.status(400).json({ error: 'Card is already active' });
    }

    // Activate card
    await db('nfc_cards')
      .where('id', cardId)
      .update({
        status: 'active',
        activated_at: new Date()
      });

    res.json({
      success: true,
      message: 'Card activated successfully'
    });
  } catch (error) {
    console.error('Error activating card:', error);
    res.status(500).json({ error: 'Failed to activate card' });
  }
});

// ============== Add Balance to Card ==============
router.post('/:cardId/add-balance', verifyToken, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { amount } = req.body;
    const userId = req.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Verify card belongs to user
    const card = await db('nfc_cards')
      .where('id', cardId)
      .where('user_id', userId)
      .first();

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const newBalance = parseFloat(card.balance) + parseFloat(amount);

    // Update balance
    await db('nfc_cards')
      .where('id', cardId)
      .update({
        balance: newBalance
      });

    // Log transaction
    await db('nfc_card_transactions').insert({
      nfc_card_id: cardId,
      transaction_type: 'balance_add',
      amount,
      balance_after: newBalance,
      status: 'completed'
    });

    res.json({
      success: true,
      message: 'Balance added successfully',
      new_balance: newBalance
    });
  } catch (error) {
    console.error('Error adding balance:', error);
    res.status(500).json({ error: 'Failed to add balance' });
  }
});

// ============== Verify Card (For Check-in) ==============
router.post('/verify/:uniqueId', verifyToken, async (req, res) => {
  try {
    const { uniqueId } = req.params;
    const { event_id, venue_id } = req.body;

    // Find card by unique ID
    const card = await db('nfc_cards')
      .where('unique_id', uniqueId)
      .first();

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    if (card.status !== 'active') {
      return res.status(400).json({ error: 'Card is not active' });
    }

    // Check if card is expired
    if (card.expires_at && new Date(card.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Card has expired' });
    }

    res.json({
      success: true,
      card: {
        id: card.id,
        card_number: card.card_number,
        card_type: card.card_type,
        balance: card.balance,
        status: card.status,
        owner_id: card.user_id
      }
    });
  } catch (error) {
    console.error('Error verifying card:', error);
    res.status(500).json({ error: 'Failed to verify card' });
  }
});

// ============== Process Card Usage (Deduct Balance) ==============
router.post('/:cardId/use', verifyToken, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { event_id, venue_id, ticket_id, amount, location } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Fetch card
    const card = await db('nfc_cards')
      .where('id', cardId)
      .first();

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    if (card.status !== 'active') {
      return res.status(400).json({ error: 'Card is not active' });
    }

    // Check sufficient balance
    if (card.balance < amount) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        current_balance: card.balance,
        required: amount
      });
    }

    const newBalance = parseFloat(card.balance) - parseFloat(amount);
    const newTimesUsed = card.times_used + 1;

    // Update card
    await db('nfc_cards')
      .where('id', cardId)
      .update({
        balance: newBalance,
        times_used: newTimesUsed,
        total_spent: parseFloat(card.total_spent) + parseFloat(amount)
      });

    // Log transaction
    await db('nfc_card_transactions').insert({
      nfc_card_id: cardId,
      event_id: event_id || null,
      venue_id: venue_id || null,
      ticket_id: ticket_id || null,
      transaction_type: 'usage',
      amount,
      balance_after: newBalance,
      scan_location: location,
      scan_metadata: JSON.stringify({
        timestamp: new Date().toISOString(),
        device: 'nfc_reader'
      }),
      status: 'completed'
    });

    res.json({
      success: true,
      message: 'Card used successfully',
      new_balance: newBalance,
      amount_used: amount,
      times_used: newTimesUsed
    });
  } catch (error) {
    console.error('Error using card:', error);
    res.status(500).json({ error: 'Failed to process card' });
  }
});

// ============== Get Card Details ==============
router.get('/:cardId', verifyToken, async (req, res) => {
  try {
    const { cardId } = req.params;
    const userId = req.user.id;

    const card = await db('nfc_cards')
      .where('id', cardId)
      .where('user_id', userId)
      .first();

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const transactions = await db('nfc_card_transactions')
      .where('nfc_card_id', cardId)
      .orderBy('created_at', 'desc');

    res.json({
      success: true,
      card: {
        ...card,
        metadata: card.metadata ? JSON.parse(card.metadata) : null
      },
      transactions
    });
  } catch (error) {
    console.error('Error fetching card details:', error);
    res.status(500).json({ error: 'Failed to fetch card details' });
  }
});

module.exports = router;
