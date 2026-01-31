/**
 * +0 EST is 17:00 UTC
 */
export const REFERENCE_HOUR_UTC = 17;

/**
 * Converts an array of Egg Inc. Standard Time hours (e.g., [0, -2, 4]) to UTC hours.
 * @param {number[]} estHours An array of EST hours.
 * @returns {number[]} An array of UTC hours.
 */
export function convertEstToUtc(estHours) {
    if (!estHours || estHours.length === 0) {
        return [];
    }
    const utcHours = [];

    for (const estHour of estHours) {
        const utcHour = (REFERENCE_HOUR_UTC + estHour + 24) % 24;
        utcHours.push(utcHour);
    }
    return [...new Set(utcHours)];
}

/**
 * Converts an UTC hour to EST hour.
 * @param {number} utcHour An UTC hour.
 * @returns {number} An EST hour.
 */
export function convertUtcToEst(utcHour) {
	let estHour = utcHour - REFERENCE_HOUR_UTC;
	if (estHour < -12) estHour += 24;
	if (estHour > 12) estHour -= 24;
	return estHour;
}

export function formatHourRanges(utcHours) {
    if (!utcHours || utcHours.length === 0) {
        return '';
    }

    // Convert UTC hours to game hours and sort them numerically
    const gameHours = utcHours.map(convertUtcToEst).sort((a, b) => a - b);

    const ranges = [];
    let startOfRange = gameHours[0];

    for (let i = 1; i <= gameHours.length; i++) {
        // If we are at the end of the array or the next hour is not consecutive
        if (i === gameHours.length || gameHours[i] !== gameHours[i - 1] + 1) {
            const endOfRange = gameHours[i - 1];
            const startLabel = `${startOfRange >= 0 ? '+' : ''}${startOfRange}`;

            if (startOfRange === endOfRange) {
                // Single hour
                ranges.push(startLabel);
            } else if (endOfRange === startOfRange + 1) {
                // Two consecutive hours, format as "+0,+1"
                const endLabel = `${endOfRange >= 0 ? '+' : ''}${endOfRange}`;
                ranges.push(`${startLabel},${endLabel}`);
            } else {
                // Range of three or more hours
                const endLabel = `${endOfRange >= 0 ? '+' : ''}${endOfRange}`;
                ranges.push(`${startLabel} to ${endLabel}`);
            }

            if (i < gameHours.length) {
                startOfRange = gameHours[i];
            }
        }
    }
    return ranges.join(',');
}

export default { convertEstToUtc, convertUtcToEst, formatHourRanges };