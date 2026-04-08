import React, { useState, useEffect } from 'react';
import type { Project, BusinessType, MilestoneCell, MilestoneStatus } from '../types';
import { generateId } from '../utils';
import { X } from 'lucide-react';

const BUSINESS_TYPES: BusinessType[] = ['임대', '자체', '민간', '공모', '도정'];
const STATUSES: MilestoneStatus[] = [
  '기착공',
  '착공임박',
  '인허가 진행중',
  '검토중',
  'Drop 검토중',
  '비주관, 관여X',
  '기획정',
];

const emptyCell = (): MilestoneCell => ({});

interface MilestoneCellInputProps {
  label: string;
  value: MilestoneCell;
  onChange: (v: MilestoneCell) => void;
}

const MilestoneCellInput: React.FC<MilestoneCellInputProps> = ({ label, value, onChange }) => {
  const mode = value.status ? 'status' : 'date';

  return (
    <div className="form-milestone-group">
      <label className="form-label-small">{label}</label>
      <div className="milestone-inputs">
        <select
          className="form-select-sm"
          value={mode}
          onChange={(e) => {
            if (e.target.value === 'date') onChange({ date: value.date || '' });
            else onChange({ status: STATUSES[0] });
          }}
        >
          <option value="date">날짜</option>
          <option value="status">상태</option>
        </select>
        {mode === 'date' ? (
          <>
            <input
              type="text"
              className="form-input-sm"
              placeholder="YY.MM.DD"
              value={value.date || ''}
              onChange={(e) => onChange({ ...value, date: e.target.value })}
            />
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!value.highlighted}
                onChange={(e) => onChange({ ...value, highlighted: e.target.checked })}
              />
              강조
            </label>
          </>
        ) : (
          <select
            className="form-select-sm"
            value={value.status || STATUSES[0]}
            onChange={(e) => onChange({ status: e.target.value as MilestoneStatus })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
};

interface Props {
  project?: Project | null;
  onSave: (project: Project) => void;
  onClose: () => void;
}

export const ProjectForm: React.FC<Props> = ({ project, onSave, onClose }) => {
  const [form, setForm] = useState<Project>(() =>
    project
      ? { ...project }
      : {
          id: generateId(),
          businessType: '자체',
          siteName: '',
          highlighted: false,
          designVE: emptyCell(),
          basicPlan: emptyCell(),
          archReview: emptyCell(),
          unitConfirm: emptyCell(),
          bizApproval: emptyCell(),
          designShare: emptyCell(),
          constructionStart: '',
        }
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.siteName.trim()) return;
    onSave(form);
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{project ? '사업 편집' : '사업 추가'}</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">사업유형</label>
              <select
                className="form-select"
                value={form.businessType}
                onChange={(e) => setForm({ ...form, businessType: e.target.value as BusinessType })}
              >
                {BUSINESS_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">현장명 *</label>
              <input
                type="text"
                className="form-input"
                value={form.siteName}
                onChange={(e) => setForm({ ...form, siteName: e.target.value })}
                required
                placeholder="현장명을 입력하세요"
              />
            </div>
            <div className="form-group" style={{ justifyContent: 'center', paddingTop: '28px' }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.highlighted}
                  onChange={(e) => setForm({ ...form, highlighted: e.target.checked })}
                />
                주요 사업 강조
              </label>
            </div>
          </div>

          <div className="milestone-grid">
            <MilestoneCellInput
              label="설계VE 전략회의"
              value={form.designVE}
              onChange={(v) => setForm({ ...form, designVE: v })}
            />
            <MilestoneCellInput
              label="기본계획보고 (D-12M)"
              value={form.basicPlan}
              onChange={(v) => setForm({ ...form, basicPlan: v })}
            />
            <MilestoneCellInput
              label="건축심의 완 (D-8M)"
              value={form.archReview}
              onChange={(v) => setForm({ ...form, archReview: v })}
            />
            <MilestoneCellInput
              label="단위세대 확정 (D-6M)"
              value={form.unitConfirm}
              onChange={(v) => setForm({ ...form, unitConfirm: v })}
            />
            <MilestoneCellInput
              label="사업승인 완 (D-4M)"
              value={form.bizApproval}
              onChange={(v) => setForm({ ...form, bizApproval: v })}
            />
            <MilestoneCellInput
              label="설계정보 공유회의 (D-2M)"
              value={form.designShare}
              onChange={(v) => setForm({ ...form, designShare: v })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">착공일정 (D) *</label>
            <input
              type="text"
              className="form-input"
              value={form.constructionStart}
              onChange={(e) => setForm({ ...form, constructionStart: e.target.value })}
              placeholder="YY.MM.DD"
              required
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn btn-primary">
              {project ? '저장' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
