import sanitizeHtml from 'sanitize-html';

export function safeBody(value) {
  return sanitizeHtml(value || '', {
    allowedTags: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'blockquote', 'a', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th'],
    allowedAttributes: { a: ['href', 'target', 'rel'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] },
    allowedSchemes: ['http', 'https', 'mailto']
  });
}
