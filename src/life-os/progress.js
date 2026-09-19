const MORNING_TOTAL = 6;
const EMOTIONS = ['anxiety', 'numbness', 'motivation', 'focus', 'confidence', 'loneliness', 'mood'];
const BALANCE = ['hustliq', 'college', 'mental', 'physical', 'content', 'relationships', 'learning', 'recreation'];

function dateKeysEndingAt(throughDate, count) {
  const [year, month, day] = throughDate.split('-').map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day));
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(anchor); date.setUTCDate(date.getUTCDate() - offset); return date.toISOString().slice(0, 10);
  });
}
const rounded = value => Math.round(value * 10) / 10;
const average = (items, read) => items.length ? rounded(items.reduce((sum, item) => sum + read(item), 0) / items.length) : 0;
const target = (achieved, goal) => ({ achieved, target: goal, percent: Math.min(100, Math.round(achieved / goal * 100)) });

export function calculateLifeOSProgress(store, throughDate) {
  const weekKeys = dateKeysEndingAt(throughDate, 7);
  const days = weekKeys.map(key => store.days[key]).filter(Boolean);
  const today = store.days[throughDate] || null;
  const namedPriorities = today ? [today.mustWin, ...today.supports].map((value, index) => ({ value: value.trim(), id: index === 0 ? 'must' : `support-${index - 1}` })).filter(item => item.value) : [];
  const completedPriorities = today ? namedPriorities.filter(item => today.done[item.id]).length : 0;
  const morningComplete = today ? Object.values(today.morning).filter(Boolean).length : 0;
  const episodes = store.episodes.filter(item => weekKeys.includes(item.dateKey));
  const reviewedDays = days.filter(day => [day.reviewWorked, day.reviewFailed, day.reviewDistraction, day.reviewChange].some(value => value.trim())).length;
  const weekly = {
    daysLogged: days.length, reviewedDays,
    focusMinutes: days.reduce((sum, day) => sum + (day.focusOutcome ? day.focusMinutes : 0), 0),
    focusResults: { achieved: days.filter(day => day.focusOutcome === 'yes').length, partial: days.filter(day => day.focusOutcome === 'partial').length, missed: days.filter(day => day.focusOutcome === 'no').length },
    codeMinutes: days.reduce((sum, day) => sum + day.codeMinutes, 0), filesUnderstood: days.reduce((sum, day) => sum + day.filesUnderstood, 0),
    personalContent: days.reduce((sum, day) => sum + day.contentPersonal, 0), hustliqContent: days.reduce((sum, day) => sum + day.contentHustliq, 0),
    collegeMinutes: days.reduce((sum, day) => sum + day.collegeMinutes, 0), japaneseMinutes: days.reduce((sum, day) => sum + day.japaneseMinutes, 0),
    meaningfulConversations: days.filter(day => day.meaningfulConversation).length, adventures: days.filter(day => day.socialAdventure === 'yes').length,
    rehabSessions: days.filter(day => day.rehab === 'yes').length, gymSessions: days.filter(day => day.gym === 'yes').length,
    averageConsumerScrollMinutes: average(days, day => day.scrollMinutes), impulsesLogged: episodes.length, impulsesInterrupted: episodes.filter(item => item.interrupted).length,
    averageCodeConfidence: average(days, day => day.codeConfidence),
    emotions: Object.fromEntries(EMOTIONS.map(key => [key, average(days, day => day.emotions[key])])),
    balance: Object.fromEntries(BALANCE.map(key => [key, average(days, day => day.balance[key])])),
  };
  return {
    throughDate,
    today: { logged: Boolean(today), priorities: { completed: completedPriorities, planned: namedPriorities.length, percent: namedPriorities.length ? Math.round(completedPriorities / namedPriorities.length * 100) : 0 }, morning: { completed: morningComplete, total: MORNING_TOTAL, percent: Math.round(morningComplete / MORNING_TOTAL * 100) }, focusOutcome: today?.focusOutcome || '', focusMinutes: today?.focusMinutes || 0 },
    week: { ...weekly, targets: { codeMinutes: target(weekly.codeMinutes, 140), japaneseMinutes: target(weekly.japaneseMinutes, 140), personalContent: target(weekly.personalContent, 7), hustliqContent: target(weekly.hustliqContent, 4), meaningfulConversations: target(weekly.meaningfulConversations, 3), adventures: target(weekly.adventures, 1), rehabSessions: target(weekly.rehabSessions, 3), gymSessions: target(weekly.gymSessions, 3) } },
  };
}
