// Inline SVG icon set (stroke icons, 24x24 grid) - no external icon dependency.
const wrap = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

const STAR = '<path d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4L12 16.4 7.2 19l1-5.4-4-3.8 5.4-.7z"/>';

export const icons = {
  back: wrap('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  forward: wrap('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  reload: wrap('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  home: wrap('<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>'),
  lock: wrap('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  warn: wrap('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>'),
  star: wrap(STAR),
  starFill: wrap(STAR, 'fill="currentColor"'),
  menu: wrap('<circle cx="12" cy="5.5" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="12" cy="18.5" r="1.1"/>', 'fill="currentColor"'),
  code: wrap('<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>'),
  plus: wrap('<path d="M12 5v14M5 12h14"/>'),
  x: wrap('<path d="M6 6l12 12M18 6L6 18"/>'),
  search: wrap('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>'),
  check: wrap('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  globe: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.7 3.5 5.5 3.5 8.5s-1 5.8-3.5 8.5c-2.5-2.7-3.5-5.5-3.5-8.5s1-5.8 3.5-8.5z"/>'),
  chevronDown: wrap('<path d="M6 9l6 6 6-6"/>'),
  alert: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M12 8v5M12 16h.01"/>'),
};

// Fill every element that declares data-icon="name".
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const svg = icons[el.dataset.icon];
    if (svg) el.innerHTML = svg;
  });
}
