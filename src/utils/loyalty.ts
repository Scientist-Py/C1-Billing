import type { Bill, LoyaltyTransaction } from '../types';

export const POINTS_CONVERSION_RATE = 100; // 1 point per ₹100 spent
export const POINT_VALUE = 1; // 1 point = ₹1 discount

export type LoyaltyTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

/**
 * Determine loyalty tier based on total accumulated points.
 */
export const getLoyaltyTier = (points: number): LoyaltyTier => {
  if (points >= 1000) return 'Platinum';
  if (points >= 500) return 'Gold';
  if (points >= 100) return 'Silver';
  return 'Bronze';
};

/**
 * Calculate loyalty points earned from a transaction.
 */
export const calculatePointsEarned = (grandTotal: number): number => {
  return Math.floor(grandTotal / POINTS_CONVERSION_RATE);
};

/**
 * Creates an automatic earn transaction for a settled bill.
 */
export const createEarnTransaction = (
  customerId: string,
  bill: Bill
): LoyaltyTransaction => {
  const pointsEarned = calculatePointsEarned(bill.grandTotal);
  return {
    id: `loy_earn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    customerId,
    pointsAdded: pointsEarned,
    pointsSubtracted: 0,
    type: 'earn',
    reason: `Points earned from Bill #${bill.billNumber}`,
    timestamp: new Date().toISOString(),
    billId: bill.id,
  };
};

/**
 * Creates a points redemption transaction.
 */
export const createRedeemTransaction = (
  customerId: string,
  pointsToRedeem: number,
  billId?: string
): LoyaltyTransaction => {
  return {
    id: `loy_red_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    customerId,
    pointsAdded: 0,
    pointsSubtracted: pointsToRedeem,
    type: 'redeem',
    reason: `Points redeemed for checkout discount`,
    timestamp: new Date().toISOString(),
    billId,
  };
};

/**
 * Checks and creates birthday bonus points transaction if applicable.
 */
export const checkBirthdayBonus = (
  customerId: string,
  birthdayStr?: string
): LoyaltyTransaction | null => {
  if (!birthdayStr) return null;
  const today = new Date();
  const bday = new Date(birthdayStr);
  
  if (today.getDate() === bday.getDate() && today.getMonth() === bday.getMonth()) {
    return {
      id: `loy_bday_${Date.now()}`,
      customerId,
      pointsAdded: 50, // 50 birthday bonus points
      pointsSubtracted: 0,
      type: 'birthday_bonus',
      reason: 'Happy Birthday Bonus Points! 🎉',
      timestamp: new Date().toISOString(),
    };
  }
  return null;
};
