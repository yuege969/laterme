import { alarms } from '../utils/browser';

export function initAlarms(): void {
  // Check for expired temp bookmarks every day
  alarms.create('expiry-check', {
    periodInMinutes: 24 * 60,
    delayInMinutes: 5,
  });
}
