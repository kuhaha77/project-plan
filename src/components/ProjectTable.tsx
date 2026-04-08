import React from 'react';
import type { Project, BusinessType } from '../types';
import { MilestoneCellView } from './MilestoneCellView';
import { businessTypeColor, isOverdue, isUpcoming } from '../utils';
import { Pencil, Trash2 } from 'lucide-react';

interface Props {
  projects: Project[];
  onEdit: (project: Project) => void;
  onDelete: (id: string) => void;
  onToggleHighlight: (id: string) => void;
}

const COLUMNS = [
  { key: 'businessType', label: '사업유형', width: 60 },
  { key: 'siteName', label: '현장명', width: 150 },
  { key: 'designVE', label: '설계VE\n전략회의', width: 130 },
  { key: 'basicPlan', label: '기본계획보고\n(D-12M)', width: 110 },
  { key: 'archReview', label: '건축심의 완\n(D-8M)', width: 100 },
  { key: 'unitConfirm', label: '단위세대\n확정\n(D-6M)', width: 90 },
  { key: 'bizApproval', label: '사업승인 완\n(D-4M)', width: 100 },
  { key: 'designShare', label: '설계정보\n공유회의\n(D-2M)', width: 90 },
  { key: 'constructionStart', label: '착공일정\n(D)', width: 90 },
  { key: 'actions', label: '', width: 64 },
];

export const ProjectTable: React.FC<Props> = ({
  projects,
  onEdit,
  onDelete,
  onToggleHighlight,
}) => {
  return (
    <div className="table-wrapper">
      <table className="project-table">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th key={col.key} style={{ minWidth: col.width }}>
                {col.label.split('\n').map((line, i) => (
                  <React.Fragment key={i}>
                    {line}
                    {i < col.label.split('\n').length - 1 && <br />}
                  </React.Fragment>
                ))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const startOverdue = isOverdue(project.constructionStart);
            const startUpcoming = isUpcoming(project.constructionStart, 60);
            return (
              <tr
                key={project.id}
                className={[
                  project.highlighted ? 'row-highlighted' : '',
                ].filter(Boolean).join(' ')}
              >
                <td>
                  <span
                    className="badge-type"
                    style={{ background: businessTypeColor(project.businessType as BusinessType) }}
                  >
                    {project.businessType}
                  </span>
                </td>
                <td
                  className={`site-name ${project.highlighted ? 'site-highlighted' : ''}`}
                  onClick={() => onToggleHighlight(project.id)}
                  title="클릭하여 강조 표시 전환"
                >
                  {project.siteName}
                </td>
                <td><MilestoneCellView cell={project.designVE} /></td>
                <td><MilestoneCellView cell={project.basicPlan} /></td>
                <td><MilestoneCellView cell={project.archReview} /></td>
                <td><MilestoneCellView cell={project.unitConfirm} /></td>
                <td><MilestoneCellView cell={project.bizApproval} /></td>
                <td><MilestoneCellView cell={project.designShare} /></td>
                <td>
                  <span
                    className={[
                      'construction-date',
                      startOverdue ? 'cell-overdue' : '',
                      startUpcoming ? 'cell-upcoming' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {project.constructionStart}
                  </span>
                </td>
                <td className="actions-cell">
                  <button
                    className="btn-icon"
                    onClick={() => onEdit(project)}
                    title="편집"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="btn-icon btn-danger"
                    onClick={() => onDelete(project.id)}
                    title="삭제"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            );
          })}
          {projects.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="empty-row">
                조건에 맞는 사업이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
