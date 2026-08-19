const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MILLISECONDS_PER_MINUTE = 60 * 1000;

const GREEN_LIMIT_MINUTES = 30;
const YELLOW_LIMIT_MINUTES = 2 * MINUTES_PER_HOUR;
const ORANGE_LIMIT_MINUTES = 6 * MINUTES_PER_HOUR;

function formatElapsedMinutes(elapsedMinutes) {
  if (elapsedMinutes < MINUTES_PER_HOUR) {
    return `${elapsedMinutes}分前`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / MINUTES_PER_HOUR);
  if (elapsedHours < HOURS_PER_DAY) {
    return `${elapsedHours}時間前`;
  }

  return `${Math.floor(elapsedHours / HOURS_PER_DAY)}日前`;
}

export function getFreshness(confirmedAt, now = new Date()) {
  const confirmedDate = confirmedAt ? new Date(confirmedAt) : null;
  if (!confirmedDate || Number.isNaN(confirmedDate.getTime())) {
    return {
      level: 'black',
      elapsedMinutes: null,
      display: '未確認',
      delayed: true
    };
  }

  const elapsedMinutes = Math.max(
    0,
    Math.floor((now.getTime() - confirmedDate.getTime()) / MILLISECONDS_PER_MINUTE)
  );

  let level = 'black';
  if (elapsedMinutes <= GREEN_LIMIT_MINUTES) {
    level = 'green';
  } else if (elapsedMinutes <= YELLOW_LIMIT_MINUTES) {
    level = 'yellow';
  } else if (elapsedMinutes <= ORANGE_LIMIT_MINUTES) {
    level = 'orange';
  }

  return {
    level,
    elapsedMinutes,
    display: formatElapsedMinutes(elapsedMinutes),
    delayed: elapsedMinutes > GREEN_LIMIT_MINUTES
  };
}
