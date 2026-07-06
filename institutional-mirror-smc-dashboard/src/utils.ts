/**
 * Utility functions for time zones, DST detection, Kill Zones, and formatted outputs.
 */

import { KILL_ZONES, KillZone } from './types';

/**
 * Returns DST start and end dates in UTC for a given year.
 * - DST Starts: Second Sunday of March (02:00 EST / 07:00 UTC)
 * - DST Ends: First Sunday of November (02:00 EDT / 06:00 UTC)
 */
export function getDstTransitionDates(year: number) {
  // 2nd Sunday of March
  let marchSundayCount = 0;
  const marchDstStart = new Date(Date.UTC(year, 2, 1, 7, 0, 0)); // March 1st, 07:00 UTC
  while (marchSundayCount < 2) {
    if (marchDstStart.getUTCDay() === 0) {
      marchSundayCount++;
      if (marchSundayCount === 2) break;
    }
    marchDstStart.setUTCDate(marchDstStart.getUTCDate() + 1);
  }

  // 1st Sunday of November
  let novSundayCount = 0;
  const novDstEnd = new Date(Date.UTC(year, 10, 1, 6, 0, 0)); // November 1st, 06:00 UTC
  while (novSundayCount < 1) {
    if (novDstEnd.getUTCDay() === 0) {
      novSundayCount++;
      if (novSundayCount === 1) break;
    }
    novDstEnd.setUTCDate(novDstEnd.getUTCDate() + 1);
  }

  return { start: marchDstStart, end: novDstEnd };
}

/**
 * Checks if a given UTC date is in EDT (Eastern Daylight Time, UTC-4) or EST (Eastern Standard Time, UTC-5).
 */
export function isEdt(dateUtc: Date): boolean {
  const year = dateUtc.getUTCFullYear();
  const { start, end } = getDstTransitionDates(year);
  const time = dateUtc.getTime();
  return time >= start.getTime() && time < end.getTime();
}

/**
 * Formats current UTC and EST/EDT times.
 */
export function getClocks(now: Date) {
  const utcString = now.toUTCString().replace('GMT', 'UTC');
  
  const edtActive = isEdt(now);
  const offsetHours = edtActive ? -4 : -5;
  const estDate = new Date(now.getTime() + offsetHours * 60 * 60 * 1000);
  
  // Format EST/EDT manually to avoid system locale issues
  const estHours = String(estDate.getUTCHours()).padStart(2, '0');
  const estMins = String(estDate.getUTCMinutes()).padStart(2, '0');
  const estSecs = String(estDate.getUTCSeconds()).padStart(2, '0');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const estDayName = days[estDate.getUTCDay()];
  const estDayNum = estDate.getUTCDate();
  const estMonthName = months[estDate.getUTCMonth()];
  const estYear = estDate.getUTCFullYear();

  const estString = `${estDayName}, ${estDayNum} ${estMonthName} ${estYear} ${estHours}:${estMins}:${estSecs} ${edtActive ? 'EDT (UTC-4)' : 'EST (UTC-5)'}`;

  return {
    utc: utcString,
    est: estString,
    isEdt: edtActive,
    estTimeOnly: `${estHours}:${estMins}:${estSecs}`,
    utcTimeOnly: `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}`
  };
}

/**
 * Format seconds as HH:MM:SS
 */
export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export type MarketStatus =
  | { type: 'WEEKEND'; countdownSecs: number; nextStartUtc: string }
  | { type: 'KILL_ZONE'; zoneName: string; countdownSecs: number; endUtcStr: string }
  | { type: 'DEAD_ZONE'; nextZoneName: string; countdownSecs: number; startUtcStr: string };

/**
 * Check if current UTC time is in the weekend range.
 * Weekend: Saturday 22:00 UTC through Sunday 22:00 UTC.
 * Countdown goes to Monday 07:00 UTC (When market resumes activity).
 */
export function getMarketStatus(now: Date): MarketStatus {
  const day = now.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const second = now.getUTCSeconds();

  // Seconds since start of Sunday (00:00:00 Sunday is 0)
  // Let's check weekend condition:
  // Saturday 22:00 UTC to Sunday 22:00 UTC
  const isWeekend = 
    (day === 6 && hour >= 22) || 
    (day === 0 && hour < 22);

  if (isWeekend) {
    // Calculate seconds until Monday 07:00 UTC
    // Find next Monday date
    const targetMonday = new Date(now);
    targetMonday.setUTCDate(now.getUTCDate() + ((1 + 7 - day) % 7 || 7));
    targetMonday.setUTCHours(7, 0, 0, 0);
    
    // If we're on Sunday, (1 + 7 - 0)%7 is 1 day.
    // If we're on Saturday, (1 + 7 - 6)%7 is 2 days.
    const diffMs = targetMonday.getTime() - now.getTime();
    const countdownSecs = Math.max(0, Math.floor(diffMs / 1000));
    
    return {
      type: 'WEEKEND',
      countdownSecs,
      nextStartUtc: 'Monday 07:00 UTC'
    };
  }

  // Not weekend. Check Kill Zones in seconds.
  const currentSeconds = hour * 3600 + minute * 60 + second;

  // Let's check each Kill Zone:
  // Asian Range: 00:00–04:00 (0 to 14400)
  // London KZ: 07:00–10:00 (25200 to 36000)
  // New York KZ: 12:00–15:00 (43200 to 54000)
  // Silver Bullet: 15:00–16:00 (54000 to 57600)

  if (currentSeconds >= 0 && currentSeconds < 14400) {
    return {
      type: 'KILL_ZONE',
      zoneName: 'Asian Range',
      countdownSecs: 14400 - currentSeconds,
      endUtcStr: '04:00 UTC'
    };
  }

  if (currentSeconds >= 25200 && currentSeconds < 36000) {
    return {
      type: 'KILL_ZONE',
      zoneName: 'London KZ',
      countdownSecs: 36000 - currentSeconds,
      endUtcStr: '10:00 UTC'
    };
  }

  if (currentSeconds >= 43200 && currentSeconds < 54000) {
    return {
      type: 'KILL_ZONE',
      zoneName: 'New York KZ',
      countdownSecs: 54000 - currentSeconds,
      endUtcStr: '15:00 UTC'
    };
  }

  if (currentSeconds >= 54000 && currentSeconds < 57600) {
    return {
      type: 'KILL_ZONE',
      zoneName: 'Silver Bullet',
      countdownSecs: 57600 - currentSeconds,
      endUtcStr: '16:00 UTC'
    };
  }

  // If we reach here, we are in a Dead Zone. Determine the next Kill Zone:
  let nextZoneName = 'Asian Range';
  let nextStartSeconds = 0;
  let countdownSecs = 0;

  if (currentSeconds < 25200) { // between 14400 (04:00) and 25200 (07:00)
    nextZoneName = 'London KZ';
    nextStartSeconds = 25200;
    countdownSecs = nextStartSeconds - currentSeconds;
  } else if (currentSeconds < 43200) { // between 36000 (10:00) and 43200 (12:00)
    nextZoneName = 'New York KZ';
    nextStartSeconds = 43200;
    countdownSecs = nextStartSeconds - currentSeconds;
  } else { // after 57600 (16:00) until end of UTC day (86400)
    nextZoneName = 'Asian Range';
    nextStartSeconds = 86400; // start of next UTC day
    countdownSecs = nextStartSeconds - currentSeconds;
  }

  const startHourStr = String(Math.floor(nextStartSeconds === 86400 ? 0 : nextStartSeconds / 3600)).padStart(2, '0');
  const startMinStr = '00';

  return {
    type: 'DEAD_ZONE',
    nextZoneName,
    countdownSecs,
    startUtcStr: `${startHourStr}:${startMinStr} UTC`
  };
}
