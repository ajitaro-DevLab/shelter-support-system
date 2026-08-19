import { getConfirmationSchedule } from './confirmation-schedule.js';

const TIME_ZONE = 'Asia/Tokyo';
const HOURS_PER_DAY = 24;
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const JAPAN_TIME_OFFSET = '+09:00';

function getDateKeyInJapan(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getCurrentSlotStart(now, currentSlot) {
  const schedule = getConfirmationSchedule(now);
  const isPreviousDaySlot = currentSlot === '18:00'
    && schedule.nextSlot === '09:00'
    && schedule.nextDay === false;

  const slotDate = isPreviousDaySlot
    ? new Date(now.getTime() - HOURS_PER_DAY * MILLISECONDS_PER_HOUR)
    : now;
  return new Date(`${getDateKeyInJapan(slotDate)}T${currentSlot}:00${JAPAN_TIME_OFFSET}`);
}

export function getDisplayConfidence({
  confidence,
  confirmationSlot,
  confirmedAt
}, now = new Date()) {
  const { currentSlot } = getConfirmationSchedule(now);
  if (!confirmedAt || confirmationSlot !== currentSlot) {
    return 'unconfirmed';
  }

  const confirmedDate = new Date(confirmedAt);
  const currentSlotStart = getCurrentSlotStart(now, currentSlot);
  if (
    Number.isNaN(confirmedDate.getTime())
    || confirmedDate < currentSlotStart
    || confirmedDate > now
  ) {
    return 'unconfirmed';
  }

  return confidence;
}
