import { useState, useMemo } from 'react';
import type { Project, BusinessType } from './types';
import { initialProjects } from './data';
import { ProjectTable } from './components/ProjectTable';
import { ProjectForm } from './components/ProjectForm';
import { FilterBar } from './components/FilterBar';
import { SummaryCards } from './components/SummaryCards';
import { Building2 } from 'lucide-react';
import './App.css';

function App() {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [search, setSearch] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<BusinessType[]>([]);
  const [showHighlightedOnly, setShowHighlightedOnly] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null | undefined>(undefined);

  // undefined = form closed, null = add new, Project = edit
  const isFormOpen = editingProject !== undefined;

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (search && !p.siteName.includes(search)) return false;
      if (selectedTypes.length > 0 && !selectedTypes.includes(p.businessType)) return false;
      if (showHighlightedOnly && !p.highlighted) return false;
      return true;
    });
  }, [projects, search, selectedTypes, showHighlightedOnly]);

  const toggleType = (type: BusinessType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleSave = (project: Project) => {
    setProjects((prev) => {
      const idx = prev.findIndex((p) => p.id === project.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = project;
        return next;
      }
      return [...prev, project];
    });
    setEditingProject(undefined);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('이 사업을 삭제하시겠습니까?')) {
      setProjects((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const handleToggleHighlight = (id: string) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, highlighted: !p.highlighted } : p))
    );
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <Building2 size={24} className="header-icon" />
          <div>
            <h1 className="app-title">사업 일정 관리</h1>
            <p className="app-subtitle">착공 마일스톤 추적 시스템</p>
          </div>
        </div>
        <div className="header-right">
          <span className="today-label">{dateStr}</span>
        </div>
      </header>

      <main className="app-main">
        <SummaryCards projects={projects} />

        <div className="section-card">
          <FilterBar
            search={search}
            onSearch={setSearch}
            selectedTypes={selectedTypes}
            onToggleType={toggleType}
            showHighlightedOnly={showHighlightedOnly}
            onToggleHighlighted={() => setShowHighlightedOnly((v) => !v)}
            totalCount={projects.length}
            filteredCount={filteredProjects.length}
            onAdd={() => setEditingProject(null)}
          />

          <div className="legend">
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#f5c518' }} />
              날짜 강조 (지연 위험)
            </span>
            <span className="legend-item">
              <span className="legend-dot overdue-dot" />
              착공 지연
            </span>
            <span className="legend-item">
              <span className="legend-dot upcoming-dot" />
              착공 임박 (30일)
            </span>
            <span className="legend-item">
              <span className="legend-border-sample" />
              주요 사업 강조
            </span>
          </div>

          <ProjectTable
            projects={filteredProjects}
            onEdit={(p) => setEditingProject(p)}
            onDelete={handleDelete}
            onToggleHighlight={handleToggleHighlight}
          />
        </div>
      </main>

      {isFormOpen && (
        <ProjectForm
          project={editingProject}
          onSave={handleSave}
          onClose={() => setEditingProject(undefined)}
        />
      )}
    </div>
  );
}

export default App;
