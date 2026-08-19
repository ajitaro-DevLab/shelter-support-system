(() => {
  const TIME_ZONE = 'Asia/Tokyo';

  function getHourInJapan(date) {
    const hourPart = new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      hour: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date).find((part) => part.type === 'hour');
    return Number(hourPart.value);
  }

  function getConfirmationSchedule(date = new Date()) {
    const hour = getHourInJapan(date);
    if (hour < 9) {
      return { currentSlot: '18:00', currentSlotLabel: '18:00', nextSlotLabel: '09:00' };
    }
    if (hour < 13) {
      return { currentSlot: '09:00', currentSlotLabel: '09:00', nextSlotLabel: '13:00' };
    }
    if (hour < 18) {
      return { currentSlot: '13:00', currentSlotLabel: '13:00', nextSlotLabel: '18:00' };
    }
    return { currentSlot: '18:00', currentSlotLabel: '18:00', nextSlotLabel: '翌日09:00' };
  }

  window.ConfirmationSchedule = { getConfirmationSchedule };
})();
