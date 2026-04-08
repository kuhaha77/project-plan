import React from 'react';
import type { BusinessType } from '../types';
import { businessTypeColor } from '../utils';
import { Plus, Search, Flag } from 'lucide-react';

const BUSINESS_TYPES: BusinessType[] = ['임대', '자체', '민간', '공모', '도정'];

interface Props {
  search: string;
  onSearch: (v: string) => void;
  selectedTypes: BusinessType[];
  onToggleType: (t: BusinessType) => void;
  showHighlightedOnly: boolean;
  onToggleHighlighted: () => void;
  totalCount: number;
  filteredCount: number;
  onAdd: () => void;
}

export const FilterBar: React.FC<Props> = ({
  search,
  onSearch,
  selectedTypes,
  onToggleType,
  showHighlightedOnly,
  onToggleHighlighted,
  totalCount,
  filteredCount,
  onAdd,
}) => {
  return (
    <div className="filter-bar">
      <div className="filter-bar-left">
        <div className="search-box">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            placeholder="현장명 검색..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="type-filters">
          {BUSINESS_TYPES.map((type) => {
            const active = selectedTypes.includes(type);
            return (
              <button
                key={type}
                className={`filter-chip ${active ? 'active' : ''}`}
                style={active ? { background: businessTypeColor(type), borderColor: businessTypeColor(type), color: '#fff' } : {}}
                onClick={() => onToggleType(type)}
              >
                {type}
              </button>
            );
          })}
        </div>

        <button
          className={`filter-chip ${showHighlightedOnly ? 'active highlight-chip' : ''}`}
          onClick={onToggleHighlighted}
          title="주요 사업만 보기"
        >
          <Flag size={12} style={{ marginRight: 3 }} />
          주요 사업
        </button>
      </div>

      <div className="filter-bar-right">
        <span className="count-label">
          {filteredCount === totalCount ? `총 ${totalCount}건` : `${filteredCount} / ${totalCount}건`}
        </span>
        <button className="btn btn-primary btn-sm" onClick={onAdd}>
          <Plus size={14} />
          사업 추가
        </button>
      </div>
    </div>
  );
};
