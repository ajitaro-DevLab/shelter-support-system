const CONFIRMATION_HOURS = [9, 13, 18];
const TIME_ZONE = 'Asia/Tokyo';

function getHourInJapan(date) {
  const hourPart = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).find((part) => part.type === 'hour');

  return Number(hourPart.value);
}

export function getConfirmationSchedule(date) {
  const hour = getHourInJapan(date);

  if (hour < CONFIRMATION_HOURS[0]) {
    return { currentSlot: '18:00', nextSlot: '09:00', nextDay: false };
  }
  if (hour < CONFIRMATION_HOURS[1]) {
    return { currentSlot: '09:00', nextSlot: '13:00', nextDay: false };
  }
  if (hour < CONFIRMATION_HOURS[2]) {
    return { currentSlot: '13:00', nextSlot: '18:00', nextDay: false };
  }
  return { currentSlot: '18:00', nextSlot: '09:00', nextDay: true };
}

export const CONFIRMATION_SLOTS = new Set(
  CONFIRMATION_HOURS.map((hour) => `${String(hour).padStart(2, '0')}:00`)
);
