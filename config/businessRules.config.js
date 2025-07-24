// Business Rules Configuration
// This file centralizes all business logic decisions

module.exports = {
  // Purchase Rules
  purchase: {
    // Whether users can have multiple active packages at once
    allowMultipleActivePackages: false, // Set to true for testing, false for production
    
    // Allow purchasing when package is almost exhausted
    allowPurchaseWhenLowCredits: true,
    lowCreditsThresholdPercentage: 20, // Allow purchase when less than 20% credits remain
    
    // Allow purchasing when package is about to expire
    allowPurchaseWhenNearExpiry: true,
    nearExpiryThresholdDays: 7, // Allow purchase when less than 7 days until expiry
    
    // Merge strategy for multiple packages
    mergeStrategy: 'none', // Options: 'none', 'auto', 'manual'
    
    // Grace period after expiration (in days)
    expirationGracePeriodDays: 0,
    
    // Maximum packages per user (0 = unlimited)
    maxActivePackagesPerUser: 0,
    
    // Allow backdated purchases (for admin corrections)
    allowBackdatedPurchases: false
  },

  // Reservation Rules
  reservation: {
    // How far in advance users can book (in days)
    maxAdvanceBookingDays: 30,
    
    // Minimum hours before class to book
    minHoursBeforeClass: 2,
    
    // Cancellation policy (hours before class)
    cancellationDeadlineHours: 12,
    
    // Whether to refund credits on cancellation
    refundCreditsOnCancellation: true,
    
    // Maximum reservations per day per user
    maxReservationsPerDay: 3,
    
    // Allow waitlist when class is full
    allowWaitlist: false,
    
    // Auto-cancel no-shows
    autoCancelNoShows: false
  },

  // Payment Rules
  payment: {
    // Payment processing mode
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
    
    // Auto-approve test payments
    autoApproveTestPayments: true,
    
    // Webhook retry configuration
    webhookMaxRetries: 3,
    webhookRetryDelayMs: 5000,
    
    // Payment methods to accept
    acceptedPaymentMethods: ['credit_card', 'debit_card', 'mercadopago'],
    
    // Currency
    currency: 'MXN',
    
    // Allow manual payment recording (for cash/bank transfers)
    allowManualPayments: true
  },

  // User Rules
  user: {
    // Minimum age to register
    minimumAge: 16,
    
    // Require email verification
    requireEmailVerification: false,
    
    // Allow social login
    allowSocialLogin: false,
    
    // Account suspension after days of inactivity
    suspendAfterInactiveDays: 365,
    
    // Delete suspended accounts after days
    deleteSuspendedAfterDays: 730
  },

  // Class Rules
  class: {
    // Default class duration in minutes
    defaultDurationMinutes: 60,
    
    // Buffer time between classes in minutes
    bufferTimeMinutes: 15,
    
    // Minimum participants to run class
    minimumParticipants: 1,
    
    // Auto-cancel classes below minimum
    autoCancelBelowMinimum: false,
    
    // Hours before class to check minimum
    minimumCheckHours: 24
  },

  // Testing Overrides (only apply in development/test)
  testing: {
    // Override all purchase restrictions for testing
    bypassPurchaseRestrictions: false,//process.env.NODE_ENV !== 'production',
    
    // Accept test payment IDs
    acceptTestPayments: true,
    testPaymentIds: ['123456', 'test_payment'],
    
    // Log all transactions verbosely
    verboseLogging: true,
    
    // Skip payment verification with MercadoPago
    skipPaymentVerification: false
  },

  // Feature Flags
  features: {
    // Enable new purchase flow
    newPurchaseFlow: true,
    
    // Enable package merging
    packageMerging: false,
    
    // Enable family accounts
    familyAccounts: false,
    
    // Enable corporate accounts
    corporateAccounts: false,
    
    // Enable referral system
    referralSystem: false
  },

  // Get effective rule considering environment
  getRule(category, rule) {
    // In testing mode, check for overrides
    if (process.env.NODE_ENV !== 'production' && this.testing.bypassPurchaseRestrictions) {
      if (category === 'purchase' && rule === 'allowMultipleActivePackages') {
        return false; // Always allow in testing
      }
    }
    
    return this[category]?.[rule];
  }
};