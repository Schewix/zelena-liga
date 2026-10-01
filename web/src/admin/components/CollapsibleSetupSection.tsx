import { useId, useState, type ReactNode } from 'react';

export function CollapsibleSetupSection({ title, children }: { title: string; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(true);
  const contentId = useId();

  return (
    <section className="admin-setup-block">
      <header className="admin-setup-section-header">
        <h3>{title}</h3>
        <button
          type="button"
          className="admin-button admin-button--secondary"
          aria-expanded={!collapsed}
          aria-controls={contentId}
          aria-label={`${collapsed ? 'Rozbalit' : 'Sbalit'}: ${title}`}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? 'Rozbalit' : 'Sbalit'}
        </button>
      </header>
      <div id={contentId} className="admin-setup-section-content" hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}
