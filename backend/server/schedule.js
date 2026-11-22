export const SAMPLE_MS = 5 * 60_000;
const DAY = 86_400_000;
const OPEN_MINUTE = 9 * 60 + 30;
const REGULAR_CLOSE = 16 * 60;
// Published U.S. equity early closes. All dates are New York exchange dates.
const EARLY_CLOSES = new Set(['2026-11-27', '2026-12-24', '2027-11-26', '2028-07-03', '2028-11-24']);
const eastern = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

function parts(timestamp) {
  return Object.fromEntries(eastern.formatToParts(timestamp).filter(part => part.type !== 'literal')
    .map(part => [part.type, Number(part.value)]));
}

function observed(year, month, day, friday = true) {
  const date = Date.UTC(year, month, day);
  const weekday = new Date(date).getUTCDay();
  return weekday === 0 ? date + DAY : weekday === 6 && friday ? date - DAY : date;
}

function nthWeekday(year, month, weekday, nth) {
  const date = Date.UTC(year, month, 1);
  return date + ((weekday + 7 - new Date(date).getUTCDay()) % 7 + 7 * (nth - 1)) * DAY;
}

function goodFriday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451), offset = h + l - 7 * m + 114;
  return Date.UTC(year, Math.floor(offset / 31) - 1, offset % 31 + 1) - 2 * DAY;
}

// Nasdaq regular U.S. equity holidays. Extra exchange closures can be supplied by the operator.
function holidays(year) {
  const may31 = Date.UTC(year, 4, 31);
  return new Set([
    observed(year, 0, 1, false), nthWeekday(year, 0, 1, 3), nthWeekday(year, 1, 1, 3),
    goodFriday(year), may31 - ((new Date(may31).getUTCDay() + 6) % 7) * DAY, observed(year, 5, 19),
    observed(year, 6, 4), nthWeekday(year, 8, 1, 1), nthWeekday(year, 10, 4, 4),
    observed(year, 11, 25)
  ]);
}

const closureDates = value => new Set(value.split(',').map(date => date.trim()));

function isTradingDay(day, dateText, extra) {
  const calendar = new Date(day);
  return ![0, 6].includes(calendar.getUTCDay()) && !holidays(calendar.getUTCFullYear()).has(day) && !extra.has(dateText);
}

export function regularEquitySession(timestamp, extraClosures = '') {
  if (!Number.isFinite(timestamp)) return false;
  const { year, month, day, hour, minute } = parts(timestamp);
  const date = Date.UTC(year, month - 1, day);
  const dateText = new Date(date).toISOString().slice(0, 10);
  const minutes = hour * 60 + minute;
  const close = EARLY_CLOSES.has(dateText) ? 13 * 60 : REGULAR_CLOSE;
  return minutes >= OPEN_MINUTE && minutes < close && isTradingDay(date, dateText, closureDates(extraClosures));
}

export function campaignWindows(schedule, periods, now, extraClosures = '') {
  const firstSlot = Math.floor(now / SAMPLE_MS + 1) * SAMPLE_MS;
  if (schedule === 'continuous') return [{ from: firstSlot, to: firstSlot + periods * DAY }];
  const today = parts(now);
  const date = Date.UTC(today.year, today.month - 1, today.day);
  const extra = closureDates(extraClosures);
  const windows = [];
  for (let day = date; windows.length < periods; day += DAY) {
    const dayText = new Date(day).toISOString().slice(0, 10);
    if (!isTradingDay(day, dayText, extra)) continue;
    const tentative = day + OPEN_MINUTE * 60_000;
    const local = parts(tentative);
    const open = tentative + (OPEN_MINUTE - (local.hour * 60 + local.minute)) * 60_000;
    if (open >= firstSlot) windows.push({ from: open, to: open + 30 * 60_000 });
  }
  return windows;
}

export function slots(windows, cutoff = Infinity) {
  return windows.reduce((total, window) => {
    const end = Math.min(window.to, cutoff);
    return total + Math.max(0, Math.ceil((end - window.from) / SAMPLE_MS));
  }, 0);
}
