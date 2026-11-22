const Q64 = 2 ** 64;
const ASK_UNAVAILABLE = (1n << 128n) - 1n;

export function priceFromQ64(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const number = BigInt(value);
  return number > 0n && number < ASK_UNAVAILABLE ? Number(number) / Q64 : null;
}

export function sidePrices(quote, inverted = false) {
  const bid = priceFromQ64(quote?.bidAdj);
  const ask = priceFromQ64(quote?.askAdj);
  return inverted
    ? { bid: ask ? 1 / ask : null, ask: bid ? 1 / bid : null }
    : { bid, ask };
}

export function midpoint({ bid, ask }) {
  return bid && ask && ask >= bid ? (bid + ask) / 2 : null;
}

export function toAtomic(value, decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36 || !Number.isFinite(value) || value <= 0) return 0n;
  if (value >= 1e21) return BigInt(value) * 10n ** BigInt(decimals);
  const [whole, fractional = ''] = value.toFixed(Math.min(decimals, 12)).split('.');
  return BigInt(whole + fractional.padEnd(decimals, '0'));
}

// Walk cumulative depth. A proportional last-bin fill is a conservative output estimate.
export function estimateFill(levels = [], input, inputDecimals, outputDecimals) {
  let remaining = input;
  let output = 0n;
  let previousInput = 0n;
  let previousOutput = 0n;
  let bins = 0;
  if (input <= 0n) return { complete: false, paid: 0, received: 0, bins };
  for (const level of levels) {
    const cumulativeInput = BigInt(level.cumulativeInputVolume);
    const cumulativeOutput = BigInt(level.cumulativeVolume);
    const capacity = cumulativeInput - previousInput;
    const available = cumulativeOutput - previousOutput;
    if (capacity < 0n || available < 0n) throw new Error('Invalid cumulative depth');
    previousInput = cumulativeInput;
    previousOutput = cumulativeOutput;
    if (!capacity || !available) continue;
    const used = remaining < capacity ? remaining : capacity;
    output += available * used / capacity;
    remaining -= used;
    bins += 1;
    if (!remaining) break;
  }
  return {
    complete: remaining === 0n && output > 0n,
    paid: Number(input - remaining) / 10 ** inputDecimals,
    received: Number(output) / 10 ** outputDecimals,
    bins
  };
}

export function orderPreview(pool, quote, size, basePrice, inverted = false) {
  if (!quote?.depth || !basePrice) return null;
  const [baseDecimals, quoteDecimals] = inverted
    ? [pool.token1Decimals, pool.token0Decimals]
    : [pool.token0Decimals, pool.token1Decimals];
  const buy = estimateFill(
    inverted ? quote.depth.bids : quote.depth.asks,
    toAtomic(size, quoteDecimals), quoteDecimals, baseDecimals
  );
  const sell = estimateFill(
    inverted ? quote.depth.asks : quote.depth.bids,
    toAtomic(size / basePrice, baseDecimals), baseDecimals, quoteDecimals
  );
  return {
    buy: { ...buy, price: buy.received ? buy.paid / buy.received : null },
    sell: { ...sell, price: sell.paid ? sell.received / sell.paid : null }
  };
}

export function differenceBps(observed, reference) {
  if (!(observed > 0 && reference > 0)) return null;
  return Math.round((observed / reference - 1) * 10000 * 100) / 100;
}
