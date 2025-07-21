const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('../db');

const router = express.Router();

// Stripe webhook
router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        
        // Create subscription record
        await db.query(
          `INSERT INTO subscriptions (
            user_id, stripe_subscription_id, stripe_customer_id, 
            status, plan_type, current_period_start, current_period_end,
            trial_start, trial_end
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            session.metadata.userId,
            subscription.id,
            subscription.customer,
            subscription.status,
            subscription.items.data[0].price.recurring.interval === 'year' ? 'annual' : 'monthly',
            new Date(subscription.current_period_start * 1000),
            new Date(subscription.current_period_end * 1000),
            subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
            subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
          ]
        );
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        
        await db.query(
          `UPDATE subscriptions 
           SET status = $1, current_period_start = $2, current_period_end = $3,
               cancel_at_period_end = $4
           WHERE stripe_subscription_id = $5`,
          [
            subscription.status,
            new Date(subscription.current_period_start * 1000),
            new Date(subscription.current_period_end * 1000),
            subscription.cancel_at_period_end,
            subscription.id
          ]
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        
        await db.query(
          'UPDATE subscriptions SET status = $1 WHERE stripe_subscription_id = $2',
          ['canceled', subscription.id]
        );
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        
        // Record payment
        if (invoice.subscription) {
          const { rows } = await db.query(
            'SELECT id, user_id FROM subscriptions WHERE stripe_subscription_id = $1',
            [invoice.subscription]
          );

          if (rows.length > 0) {
            await db.query(
              `INSERT INTO payment_history (
                user_id, subscription_id, stripe_payment_intent_id, 
                amount, currency, status
              ) VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                rows[0].user_id,
                rows[0].id,
                invoice.payment_intent,
                invoice.amount_paid,
                invoice.currency,
                'succeeded'
              ]
            );
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        
        if (invoice.subscription) {
          await db.query(
            'UPDATE subscriptions SET status = $1 WHERE stripe_subscription_id = $2',
            ['past_due', invoice.subscription]
          );
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    res.status(500).send('Webhook handler failed');
  }
});

module.exports = router;