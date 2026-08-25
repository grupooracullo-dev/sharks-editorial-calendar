import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths, addWeeks, subWeeks, parseISO, isBefore, isAfter, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export {
  format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths,
  addWeeks, subWeeks, parseISO, isBefore, isAfter, differenceInDays, ptBR,
};

export function getCalendarDays(date: Date): Date[] {
  const start = startOfWeek(startOfMonth(date), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(date), { weekStartsOn: 0 });
  return eachDayOfInterval({ start, end });
}

export function getWeekDays(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 0 });
  return eachDayOfInterval({ start, end: endOfWeek(date, { weekStartsOn: 0 }) });
}

export function formatCalendarDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function getNextWeekRange(): { start: Date; end: Date } {
  const nextWeekStart = addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), 7);
  const nextWeekEnd = endOfWeek(nextWeekStart, { weekStartsOn: 0 });
  return { start: nextWeekStart, end: nextWeekEnd };
}

export function isOverdue(dateStr: string, status: string): boolean {
  if (status === 'published' || status === 'completed' || status === 'cancelled') return false;
  const date = parseISO(dateStr + 'T00:00:00');
  return isBefore(date, new Date()) && !isToday(date);
}
