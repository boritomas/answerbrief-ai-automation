'use client';

import { useEffect, useMemo, useState } from 'react';

type Section = {
  id: string;
  label: string;
};

export function SectionNav({ sections }: { sections: Section[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id || '');

  const sectionIds = useMemo(() => sections.map((section) => section.id), [sections]);

  useEffect(() => {
    const syncFromHash = () => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      if (hash && sectionIds.includes(hash)) setActiveId(hash);
    };

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (visible?.target.id) setActiveId(visible.target.id);
    }, { rootMargin: '-20% 0px -55% 0px', threshold: [0.2, 0.5, 0.8] });

    for (const id of sectionIds) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }

    window.addEventListener('hashchange', syncFromHash);
    syncFromHash();

    return () => {
      observer.disconnect();
      window.removeEventListener('hashchange', syncFromHash);
    };
  }, [sectionIds]);

  return (
    <nav aria-label="Career OS sections" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      {sections.map((section) => {
        const active = section.id === activeId;
        return (
          <a
            aria-current={active ? 'location' : undefined}
            href={`#${section.id}`}
            key={section.id}
            style={{
              background: active ? '#165ee8' : '#f3f7fc',
              border: active ? '1px solid #165ee8' : '1px solid #dce5f0',
              borderRadius: 999,
              color: active ? '#fff' : '#203858',
              fontSize: 14,
              fontWeight: 700,
              padding: '10px 14px',
              textDecoration: 'none',
            }}
          >
            {section.label}
          </a>
        );
      })}
    </nav>
  );
}
