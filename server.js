// server.js (Updated)
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const subscriptionRoutes = require('./routes/subscriptions');
const deviceRoutes = require('./routes/devices');
const webhookRoutes = require('./routes/webhooks');
const profileRoutes = require('./routes/profiles');
const timerRoutes = require('./routes/timers'); // New timer routes

// Import services
const timerCleanupService = require('./jobs/timerCleanup');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Stripe webhook needs raw body
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/timers', timerRoutes); // Add timer routes

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Altrii Recovery API is running',
    timestamp: new Date().toISOString(),
    version: '2.0.0-mdm'
  });
});

// Timer cleanup service status endpoint (for monitoring)
app.get('/api/admin/timer-stats', async (req, res) => {
  try {
    // This should be protected with admin auth in production
    const stats = await timerCleanupService.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get timer statistics'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

const PORT = process.env.PORT || 3000;

// Start server
app.listen(PORT, () => {
  console.log(`ðŸš€ Altrii Recovery API Server running on port ${PORT}`);
  console.log(`ðŸŒ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`ðŸ”— Frontend URL: ${process.env.FRONTEND_URL}`);
  
  // Start background services
  console.log('ðŸ•’ Starting timer cleanup service...');
  timerCleanupService.start();
  
  console.log('âœ… All services started successfully');
});
