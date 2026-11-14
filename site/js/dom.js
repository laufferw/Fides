// Tiny DOM builders. All text goes through textContent, never innerHTML, so
// nothing in the data files can inject markup.

function build(node, attrs, children) {
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === false || value == null) continue;
    node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const h = (tag, attrs, ...children) => build(document.createElement(tag), attrs, children);
export const svg = (tag, attrs, ...children) => build(document.createElementNS('http://www.w3.org/2000/svg', tag), attrs, children);

// replaceChildren that ignores null/false and flattens arrays, like h().
export const fill = (node, ...children) => node.replaceChildren(...build(document.createDocumentFragment(), null, children).childNodes);

// A link to a source, opening in a new tab.
export const link = (url, text) => h('a', { href: url, target: '_blank', rel: 'noopener' }, text);

const DATE = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const MONTH = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' });

// "2026-11-14" -> "Nov 14, 2026"; "2024-12" -> "December 2024".
export function formatDate(iso) {
  if (!iso) return '';
  if (/^\d{4}-\d{2}$/.test(iso)) return MONTH.format(new Date(iso + '-01T00:00:00Z'));
  return DATE.format(new Date(iso + 'T00:00:00Z'));
}
