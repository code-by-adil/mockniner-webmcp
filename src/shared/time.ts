export function formatTime(seconds: number): string {
  return formatMinutesAndSeconds(Math.floor(Math.max(0, seconds)))
}

// Callers that retain fractional seconds or use an unpadded minute field share
// the formatting without inheriting the native exam timer's rounding policy.
export function formatMinutesAndSeconds(seconds: number, minuteDigits = 2): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(minuteDigits, '0')}:${String(remainder).padStart(2, '0')}`
}
