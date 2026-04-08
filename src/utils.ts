import type { MilestoneStatus, BusinessType } from './types';

// Parse 'YY.MM.DD' to a Date object (assumes 2000s)
export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('.');
  if (parts.length !== 3) return null;
  const year = 2000 + parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return new Date(year, month, day);
}

export function isOverdue(dateStr: string): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  return d < new Date();
}

export function isUpcoming(dateStr: string, days = 30): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + days);
  return d >= now && d <= future;
}

export function businessTypeColor(type: BusinessType): string {
  switch (type) {
    case '임대': return '#4f86c6';
    case '자체': return '#5aaa6e';
    case '민간': return '#e07b39';
    case '공모': return '#9b59b6';
    case '도정': return '#c0392b';
    default: return '#666';
  }
}

export function statusLabel(status: MilestoneStatus): string {
  switch (status) {
    case '기착공': return '기착공';
    case '착공임박': return '착공임박';
    case '인허가 진행중': return '인허가 진행중';
    case '검토중': return '△ 검토중';
    case 'Drop 검토중': return 'Drop 검토중';
    case '비주관, 관여X': return '비주관, 관여X';
    case '기획정': return '기획정';
    default: return status;
  }
}

export function statusColor(status: MilestoneStatus): string {
  switch (status) {
    case '기착공': return '#c0392b';
    case '착공임박': return '#e07b39';
    case '인허가 진행중': return '#2980b9';
    case '검토중': return '#7f8c8d';
    case 'Drop 검토중': return '#8e44ad';
    case '비주관, 관여X': return '#95a5a6';
    case '기획정': return '#27ae60';
    default: return '#666';
  }
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
