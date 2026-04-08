import React from 'react';
import type { MilestoneCell } from '../types';
import { statusLabel, statusColor, isOverdue, isUpcoming } from '../utils';

interface Props {
  cell: MilestoneCell;
}

export const MilestoneCellView: React.FC<Props> = ({ cell }) => {
  if (!cell.date && !cell.status) {
    return <span className="cell-empty">-</span>;
  }

  if (cell.status) {
    return (
      <span
        className="cell-status"
        style={{ color: statusColor(cell.status) }}
      >
        - ({statusLabel(cell.status)})
      </span>
    );
  }

  if (cell.date) {
    const overdue = isOverdue(cell.date);
    const upcoming = isUpcoming(cell.date, 30);
    return (
      <span
        className={[
          'cell-date',
          cell.highlighted ? 'cell-highlighted' : '',
          overdue ? 'cell-overdue' : '',
          upcoming ? 'cell-upcoming' : '',
        ].filter(Boolean).join(' ')}
      >
        {cell.date}
      </span>
    );
  }

  return <span className="cell-empty">-</span>;
};
