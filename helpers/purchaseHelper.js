// Helper functions for purchase validation
const Purchase = require('../schemas/purchases.model');
const Package = require('../schemas/packages.model');

/**
 * Check if user can purchase a new package
 * @param {String} userId - User ID
 * @param {Boolean} allowMultiple - Whether to allow multiple active packages
 * @returns {Object} { canPurchase: Boolean, reason: String, activePackage: Object|null }
 */
async function canUserPurchase(userId, allowMultiple = false) {
  try {
    // Find active package
    const activePurchase = await Purchase.findOne({
      userId,
      expiresAt: { $gt: new Date() },
      creditsLeft: { $gt: 0 }
    }).populate('packageId', 'name creditCount');

    if (!activePurchase) {
      return {
        canPurchase: true,
        reason: 'No active package',
        activePackage: null
      };
    }

    // If we allow multiple packages, always return true
    if (allowMultiple) {
      return {
        canPurchase: true,
        reason: 'Multiple packages allowed',
        activePackage: activePurchase
      };
    }

    // Otherwise, check if current package is almost exhausted
    const creditsPercentageLeft = (activePurchase.creditsLeft / activePurchase.packageId.creditCount) * 100;
    const daysUntilExpiry = Math.ceil((activePurchase.expiresAt - new Date()) / (1000 * 60 * 60 * 24));

    // Allow purchase if less than 20% credits or less than 7 days left
    if (creditsPercentageLeft < 20 || daysUntilExpiry < 7) {
      return {
        canPurchase: true,
        reason: 'Current package almost exhausted',
        activePackage: activePurchase,
        creditsPercentageLeft,
        daysUntilExpiry
      };
    }

    return {
      canPurchase: false,
      reason: 'Active package still has sufficient credits',
      activePackage: activePurchase,
      creditsPercentageLeft,
      daysUntilExpiry
    };
  } catch (error) {
    console.error('Error checking purchase eligibility:', error);
    throw error;
  }
}

/**
 * Create a purchase with proper validation
 * @param {Object} purchaseData - { userId, packageId, paymentId }
 * @param {Object} options - { allowMultiple: Boolean, skipActiveCheck: Boolean }
 * @returns {Object} { success: Boolean, purchase: Object|null, error: String|null }
 */
async function createPurchaseWithValidation(purchaseData, options = {}) {
  const { userId, packageId, paymentId } = purchaseData;
  const { allowMultiple = false, skipActiveCheck = false } = options;

  try {
    // Check if payment already processed
    if (paymentId) {
      const existingPurchase = await Purchase.findOne({ 
        mercadoPagoPaymentId: paymentId 
      });
      
      if (existingPurchase) {
        return {
          success: false,
          purchase: existingPurchase,
          error: 'Payment already processed'
        };
      }
    }

    // Check if user can purchase
    if (!skipActiveCheck) {
      const eligibility = await canUserPurchase(userId, allowMultiple);
      if (!eligibility.canPurchase) {
        return {
          success: false,
          purchase: null,
          error: eligibility.reason,
          activePackage: eligibility.activePackage
        };
      }
    }

    // Get package details
    const Package = require('../schemas/packages.model');
    const package = await Package.findById(packageId);
    
    if (!package) {
      return {
        success: false,
        purchase: null,
        error: 'Package not found'
      };
    }

    // Calculate dates
    const boughtAt = new Date();
    const expiresAt = new Date(boughtAt);
    expiresAt.setDate(expiresAt.getDate() + package.validDays);

    // Create purchase
    const purchase = await Purchase.create({
      userId,
      packageId,
      boughtAt,
      expiresAt,
      creditsLeft: package.creditCount,
      mercadoPagoPaymentId: paymentId || null
    });

    return {
      success: true,
      purchase,
      error: null
    };
  } catch (error) {
    console.error('Error creating purchase:', error);
    return {
      success: false,
      purchase: null,
      error: error.message
    };
  }
}

/**
 * Merge multiple active packages (combine credits)
 * @param {String} userId - User ID
 * @returns {Object} { success: Boolean, mergedPackage: Object|null, error: String|null }
 */
async function mergeActivePackages(userId) {
  const session = await require('mongoose').startSession();
  session.startTransaction();

  try {
    // Find all active packages
    const activePackages = await Purchase.find({
      userId,
      expiresAt: { $gt: new Date() },
      creditsLeft: { $gt: 0 }
    }).session(session).sort({ expiresAt: -1 }); // Sort by expiration date

    if (activePackages.length <= 1) {
      await session.abortTransaction();
      return {
        success: false,
        mergedPackage: null,
        error: 'No multiple active packages to merge'
      };
    }

    // Use the latest expiration date
    const latestExpiration = activePackages[0].expiresAt;
    
    // Sum all credits
    const totalCredits = activePackages.reduce((sum, pkg) => sum + pkg.creditsLeft, 0);

    // Update the first package with combined values
    activePackages[0].creditsLeft = totalCredits;
    activePackages[0].expiresAt = latestExpiration;
    await activePackages[0].save({ session });

    // Mark other packages as exhausted
    for (let i = 1; i < activePackages.length; i++) {
      activePackages[i].creditsLeft = 0;
      await activePackages[i].save({ session });
    }

    await session.commitTransaction();

    return {
      success: true,
      mergedPackage: activePackages[0],
      mergedCount: activePackages.length,
      totalCredits
    };
  } catch (error) {
    await session.abortTransaction();
    console.error('Error merging packages:', error);
    return {
      success: false,
      mergedPackage: null,
      error: error.message
    };
  } finally {
    session.endSession();
  }
}

module.exports = {
  canUserPurchase,
  createPurchaseWithValidation,
  mergeActivePackages
};