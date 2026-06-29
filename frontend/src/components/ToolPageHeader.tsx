import React from 'react';

interface ToolPageHeaderProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  className?: string;
}

export default function ToolPageHeader({ icon, title, description, className = '' }: ToolPageHeaderProps) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      {icon && (
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
             style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)' }}>
          <div style={{ color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
            {icon}
          </div>
        </div>
      )}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-gradient">{title}</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {description}
        </p>
      </div>
    </div>
  );
}
