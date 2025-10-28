import * as nodeCrypto from 'crypto';

const db = require('./database');


export function hashPassword(password) {
  const salt = nodeCrypto.randomBytes(16).toString('hex');
  const hash = nodeCrypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, hashed) {
  if (!hashed) return false;
  const [salt, hash] = hashed.split(':');
  const hashedAttempt = nodeCrypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === hashedAttempt;
}



function isLocationCovered(driverLocation, pickup, dropoff) {
  return true; 
}
function hasAllergenConflict(driverAllergens, clientAllergens) {
    return false;
}



/**
 * Executes the Hard Filter to eliminate drivers who cannot physically take the ride.
 * @param {object} rideRequest - The full details of the requested ride.
 * @param {Array<object>} activeDrivers - List of all active drivers with profile/vehicle data.
 * @param {string} userToken - The user's JWT for database calls.
 * @returns {Array<object>} - A list of drivers who passed all checks.
 */
export async function applyHardFilter(rideRequest, activeDrivers, userToken) {
  const passedDrivers = [];

  for (const driver of activeDrivers) {
    let failureReason = null;
    // Assuming vehicles is an array on the driver object and we check the first active one
    const vehicle = driver.vehicles && driver.vehicles.length > 0 ? driver.vehicles[0] : null; 

    // 1. Check Schedule/Availability
    if (!failureReason) {
      // rideRequest.timeWindow must be defined as { start: 'ISO_STRING', end: 'ISO_STRING' }
      const overlaps = await db.getDriverAvailability(driver.user_id, rideRequest.timeWindow, userToken);
      if (overlaps && overlaps.length > 0) {
        failureReason = "Time off overlaps";
      }
    }

    // 2. Check Geography/Location
    if (!failureReason && !isLocationCovered(driver.location, rideRequest.pickup, rideRequest.dropoff)) {
      failureReason = "Outside geographic coverage";
    }

    // 3. Check Capacity
    const requiredSeats = rideRequest.riders + (rideRequest.hasServiceAnimal ? 1 : 0) + (rideRequest.hasOxygen ? 1 : 0);
    if (!failureReason && (!vehicle || vehicle.max_passengers < requiredSeats)) {
      failureReason = "Capacity too small";
    }

    // 4. Check Special Needs (Service Animal)
    if (!failureReason && rideRequest.hasServiceAnimal && !driver.can_accept_service_animals) {
      failureReason = "Cannot accept service animals";
    }

    // 5. Check Vehicle Height
    if (!failureReason && rideRequest.car_height_needed && (!vehicle || vehicle.height < rideRequest.car_height_needed)) {
      failureReason = "Vehicle too short";
    }
    
    // 6. Check Allergens
    if (!failureReason && hasAllergenConflict(driver.allergens, rideRequest.client_allergens)) {
      failureReason = "Allergen conflict";
    }

    if (failureReason) {
      // Log the failure for transparency/audit
      await db.recordMatchFailure(rideRequest.rideId, driver.user_id, failureReason, userToken);
    } else {
      passedDrivers.push(driver);
    }
  }

  return passedDrivers;
}

/**
 * Ranks the filtered drivers based on quality metrics and fairness (rotation).
 * @param {Array<object>} drivers - List of drivers who passed the hard filter.
 * @param {object} rideRequest - The full details of the requested ride.
 * @param {Array<object>} driverStats - Metrics like last_drove, recent assignments (must contain user_id and last_drove).
 * @returns {Array<object>} - The fully ranked list of matched drivers.
 */
export function rankDrivers(drivers, rideRequest, driverStats) {
  // 1. Merge driver stats (last_drove) into the driver objects
  const rankedDrivers = drivers.map(driver => {
    // Find matching stats, default to a very old date (0) if no stats found, bubbling to top.
    const stats = driverStats.find(s => s.user_id === driver.user_id) || { last_drove: 0 };
    return { ...driver, ...stats };
  });

  // 2. Define the pickup and dropoff towns for comparison
  const pickupTown = rideRequest.pickup_town;
  const dropoffTown = rideRequest.dropoff_town;

  // 3. Sort logic: Town Preference (Primary) then Last Drove (Secondary/Tie-breaker)
  rankedDrivers.sort((a, b) => {
    const aPref = a.town_preference; 
    const bPref = b.town_preference;

    // --- Town Preference Ranking Logic (Higher score is better) ---
    const getPreferenceScore = (driverPref) => {
      let score = 0;
      // Score 3: Matches both pickup and dropoff
      if (driverPref === pickupTown && driverPref === dropoffTown) score = 3;
      // Score 2: Matches one of the two
      else if (driverPref === pickupTown || driverPref === dropoffTown) score = 2;
      // Score 1: Matches neither
      else score = 1;
      return score;
    };

    const aScore = getPreferenceScore(aPref);
    const bScore = getPreferenceScore(bPref);

    // Primary sort: By Preference Score (Descending)
    if (bScore !== aScore) {
      return bScore - aScore;
    }

    // Secondary sort: By Last Drove Time (Ascending - least recent first)
    // The driver who drove longest ago (smallest timestamp) is prioritized
    const aLastDrove = a.last_drove === 0 ? 0 : new Date(a.last_drove).getTime();
    const bLastDrove = b.last_drove === 0 ? 0 : new Date(b.last_drove).getTime();
    
    return aLastDrove - bLastDrove;
  });

  return rankedDrivers;
}

module.exports = {
  hashPassword,
  verifyPassword,
  applyHardFilter,
  rankDrivers,
};