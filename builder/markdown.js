/* EvoSupplement Markdown renderer. Uses the locally bundled Marked 17.0.5. */
(function (root) {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  // Text entities remain Markdown entities. HTML tags and attribute values are
  // always escaped separately, and raw HTML never becomes an active element.
  function escapeText(value) {
    return escapeHtml(value).replace(/&amp;((?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);)/gi, '&$1');
  }

  function safeLink(href) {
    const value = String(href ?? '').trim();
    if (!value || /[\u0000-\u001f\u007f]/.test(value)) return null;
    try {
      const parsed = new URL(value, 'https://evosupplement.invalid/');
      return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? value : null;
    } catch (_) {
      return null;
    }
  }

  let parser;
  function getParser() {
    if (parser) return parser;
    if (!root.marked || typeof root.marked.Marked !== 'function') return null;
    parser = new root.marked.Marked({
      gfm: true,
      breaks: false,
      async: false,
      renderer: {
        html(token) {
          return escapeHtml(token.text);
        },
        text(token) {
          return token.tokens ? this.parser.parseInline(token.tokens) : escapeText(token.text);
        },
        link(token) {
          const label = this.parser.parseInline(token.tokens);
          const href = safeLink(token.href);
          if (href === null) return label;
          const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
          return `<a href="${escapeHtml(href)}"${title} rel="noopener noreferrer">${label}</a>`;
        },
        image(token) {
          const alt = token.tokens
            ? this.parser.parseInline(token.tokens, this.parser.textRenderer)
            : token.text;
          const label = String(alt || '').trim();
          // Uploaded Figure blocks own portable image assets. Markdown cannot
          // silently request remote images, embed data URLs, or run SVG markup.
          return `<span class="markdown-image-placeholder">[Image${label ? ': ' + escapeHtml(label) : ''} — add an uploaded Figure block]</span>`;
        }
      }
    });
    return parser;
  }

  root.EvoSupplementMarkdown = Object.freeze({
    render(source) {
      const text = String(source ?? '');
      const markdown = getParser();
      if (!markdown) return `<pre class="markdown-fallback">${escapeHtml(text)}</pre>`;
      try {
        return markdown.parse(text);
      } catch (error) {
        console.warn('Markdown rendering failed; showing plain text.', error);
        return `<pre class="markdown-fallback">${escapeHtml(text)}</pre>`;
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
