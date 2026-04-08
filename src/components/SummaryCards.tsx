import React from 'react';
import type { Project } from '../types';
import { isUpcoming, isOverdue } from '../utils';

interface Props {
  projects: Project[];
}

export const SummaryCards: React.FC<Props> = ({ projects }) => {
  const total = projects.length;
  const highlighted = projects.filter((p) => p.highlighted).length;
  const imminent = projects.filter((p) => isUpcoming(p.constructionStart, 90)).length;
  const overdue = projects.filter((p) => isOverdue(p.constructionStart)).length;

  const cards = [
    { label: '전체 사업', value: total, color: '#4f86c6', bg: '#e8f0fb' },
    { label: '주요 사업', value: highlighted, color: '#c0392b', bg: '#fdecea' },
    { label: '착공 임박 (90일)', value: imminent, color: '#e07b39', bg: '#fef3e8' },
    { label: '착공 지연', value: overdue, color: '#7f8c8d', bg: '#f4f5f6' },
  ];

  return (
    <div className="summary-cards">
      {cards.map((card) => (
        <div key={card.label} className="summary-card" style={{ borderTop: `3px solid ${card.color}`, background: card.bg }}>
          <div className="summary-value" style={{ color: card.color }}>{card.value}</div>
          <div className="summary-label">{card.label}</div>
        </div>
      ))}
    </div>
  );
};
