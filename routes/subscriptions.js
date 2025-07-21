const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { protect } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

// Create checkout session
router.post('/create-checkout', protect, async (req, res) => {
  try {
    const { planType } = req.body; // 'monthly' or 'annual'
    
    // Check if user already has a subscription
    const { rows: existingSub } = await db.query(
      'SELECT id FROM subscriptions WHERE user_id = $1 AND status IN ($2, $3)',
      [req.user.id, 'active', 'trialing']
    );

    if (existingSub.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'User already has an active subscription'
      });
    }

    // Get or create Stripe customer
    let stripeCustomerId;
    const { rows: customerRows } = await db.query(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );

    if (customerRows.length > 0 && customerRows[0].stripe_customer_id) {
      stripeCustomerId = customerRows[0].stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: {
          userId: req.user.id
        }
      });
      stripeCustomerId = customer.id;
    }

    // Create checkout session
    const priceId = planType === 'annual' 
      ? process.env.STRIPE_PRICE_ID_ANNUAL 
      : process.env.STRIPE_PRICE_ID_MONTHLY;

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      mode: 'subscription',
      subscription_data: {
        trial_period_days: 7, // 7-day free trial
        metadata: {
          userId: req.user.id
        }
      },
      success_url: `${process.env.FRONTEND_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing`,
      metadata: {
        userId: req.user.id
      }
    });

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Error creating checkout session'
    });
  }
});

// Get subscription details
router.get('/current', protect, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        subscription: null
      });
    }

    const subscription = rows[0];

    // Get additional details from Stripe if active
    if (subscription.stripe_subscription_id && subscription.status === 'active') {
      const stripeSubscription = await stripe.subscriptions.retrieve(
        subscription.stripe_subscription_id
      );

      subscription.stripe_details = {
        current_period_end: stripeSubscription.current_period_end,
        cancel_at_period_end: stripeSubscription.cancel_at_period_end
      };
    }

    res.json({
      success: true,
      subscription
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Error fetching subscription'
    });
  }
});

// Cancel subscription
router.post('/cancel', protect, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT stripe_subscription_id FROM subscriptions WHERE user_id = $1 AND status = $2',
      [req.user.id, 'active']
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active subscription found'
      });
    }

    // Cancel at period end
    const subscription = await stripe.subscriptions.update(
      rows[0].stripe_subscription_id,
      { cancel_at_period_end: true }
    );

    await db.query(
      'UPDATE subscriptions SET cancel_at_period_end = true WHERE stripe_subscription_id = $1',
      [rows[0].stripe_subscription_id]
    );

    res.json({
      success: true,
      message: 'Subscription will be canceled at the end of the billing period'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Error canceling subscription'
    });
  }
});

// Reactivate subscription
router.post('/reactivate', protect, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT stripe_subscription_id FROM subscriptions WHERE user_id = $1 AND status = $2 AND cancel_at_period_end = true',
      [req.user.id, 'active']
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No subscription to reactivate'
      });
    }

    const subscription = await stripe.subscriptions.update(
      rows[0].stripe_subscription_id,
      { cancel_at_period_end: false }
    );

    await db.query(
      'UPDATE subscriptions SET cancel_at_period_end = false WHERE stripe_subscription_id = $1',
      [rows[0].stripe_subscription_id]
    );

    res.json({
      success: true,
      message: 'Subscription reactivated'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Error reactivating subscription'
    });
  }
});

module.exports = router;