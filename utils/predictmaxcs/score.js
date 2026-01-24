export function getCS(contributionRatio, originalLength, completionTime, tw) {
  let cs = 1 + originalLength / 259200;
  cs *= 7;
  const fac = contributionRatio > 2.5
    ? 0.02221 * Math.min(contributionRatio, 12.5) + 4.386486
    : 3 * Math.pow(contributionRatio, 0.15) + 1;
  cs *= fac;
  cs *= 4 * Math.pow((1 - completionTime / originalLength), 3) + 1;
  cs *= (0.19 * tw + 1);
  cs *= 1.05;
  cs = Math.ceil(cs * 187.5);
  return cs;
}

export function getTeamwork(btvRat, numPlayers, durDays, crt, T, new2p0) {
  let B = Math.min(btvRat, 2);
  crt = Math.min(crt, 20);
  const fCR = Math.max(12 / numPlayers / durDays, 0.3);
  let CR = Math.min(fCR * crt, 6);
  if (new2p0) {
    CR = numPlayers > 1 ? 5 : 0;
    T = 0;
  }
  return (5 * B + CR + T) / 19;
}

export function getBtvRate(deflectorPercent, siabPercent, new2p0) {
  const btvRate = new2p0
    ? 12.5 * Math.min(deflectorPercent, 12) + 0.75 * Math.min(siabPercent, 50)
    : 7.5 * (deflectorPercent + siabPercent / 10);
  return btvRate / 100;
}
