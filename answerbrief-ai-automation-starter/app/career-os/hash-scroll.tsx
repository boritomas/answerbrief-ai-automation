'use client';

import { useEffect } from 'react';

export function HashScroll() {
  useEffect(() => {
    const scrollToHash = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      target.scrollIntoView({ block: 'start' });
    };

    const handleClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!link) return;
      const href = link.getAttribute('href') || '';
      const samePageHash = href.startsWith('#') || href.startsWith('/career-os#');
      if (!samePageHash) return;
      const hash = href.slice(href.indexOf('#'));
      const id = decodeURIComponent(hash.replace(/^#/, ''));
      const target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      window.history.pushState(null, '', `/career-os${hash}`);
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };

    window.addEventListener('hashchange', scrollToHash);
    document.addEventListener('click', handleClick);
    requestAnimationFrame(scrollToHash);
    const timeout = window.setTimeout(scrollToHash, 150);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('hashchange', scrollToHash);
      document.removeEventListener('click', handleClick);
    };
  }, []);

  return null;
}
