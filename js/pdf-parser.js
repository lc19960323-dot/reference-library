/* js/pdf-parser.js
 *
 * 重点：保留 PDF.js 的坐标、字号和页码信息；
 * 不要先用空格拼成整页，再依赖 split('\n') 猜测结构。
 */

export function normalizeDoi(value) {
  const match = String(value || '').match(
    /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i
  );

  if (!match) return '';

  return match[0]
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/[)\]}>.,;:'"]+$/g, '')
    .trim();
}

export async function extractPdfLayout(pdf, maxPages = 3) {
  const items = [];
  const pagesToRead = Math.min(pdf.numPages, maxPages);

  for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();

    for (const raw of textContent.items) {
      const text = String(raw.str || '').trim();
      if (!text) continue;

      const transform = raw.transform || [1, 0, 0, 1, 0, 0];
      const fontSize =
        Math.hypot(transform[2], transform[3]) ||
        Math.hypot(transform[0], transform[1]) ||
        12;

      items.push({
        text,
        page: pageNumber,
        x: Number(transform[4] || 0),
        y: Number(transform[5] || 0),
        width: Number(raw.width || 0),
        height: Number(raw.height || fontSize),
        fontSize: Number(fontSize.toFixed(2)),
        fontName: raw.fontName || ''
      });
    }
  }

  const lines = groupItemsIntoLines(items);

  return {
    items,
    lines,
    fullText: lines.map(line => line.text).join('\n')
  };
}

function median(values) {
  if (!values.length) return 12;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function groupItemsIntoLines(items) {
  const pageGroups = new Map();

  for (const item of items) {
    if (!pageGroups.has(item.page)) pageGroups.set(item.page, []);
    pageGroups.get(item.page).push(item);
  }

  const output = [];

  for (const [page, pageItems] of pageGroups) {
    const typicalFont = median(
      pageItems.map(item => item.fontSize).filter(Boolean)
    );
    const yTolerance = Math.max(2.5, typicalFont * 0.35);

    const sorted = [...pageItems].sort(
      (a, b) => b.y - a.y || a.x - b.x
    );

    const lines = [];

    for (const item of sorted) {
      let line = lines.find(
        candidate => Math.abs(candidate.y - item.y) <= yTolerance
      );

      if (!line) {
        line = {
          page,
          y: item.y,
          items: []
        };
        lines.push(line);
      }

      line.items.push(item);
      line.y =
        line.items.reduce((sum, current) => sum + current.y, 0) /
        line.items.length;
    }

    for (const line of lines) {
      line.items.sort((a, b) => a.x - b.x);

      const textParts = [];
      let previousEnd = null;

      for (const item of line.items) {
        if (
          previousEnd !== null &&
          item.x - previousEnd > Math.max(2, item.fontSize * 0.25)
        ) {
          textParts.push(' ');
        }

        textParts.push(item.text);
        previousEnd = item.x + item.width;
      }

      const text = textParts
        .join('')
        .replace(/\s+/g, ' ')
        .trim();

      if (!text) continue;

      output.push({
        page,
        y: line.y,
        text,
        fontSize: Math.max(
          ...line.items.map(item => item.fontSize)
        ),
        x: Math.min(...line.items.map(item => item.x)),
        width: line.items.reduce(
          (sum, item) => sum + item.width,
          0
        )
      });
    }
  }

  return output.sort(
    (a, b) => a.page - b.page || b.y - a.y || a.x - b.x
  );
}

function isNoiseLine(text) {
  const value = String(text || '').trim();

  return (
    !value ||
    /^(abstract|keywords?|introduction|references|doi|copyright|©)$/i.test(value) ||
    /^(摘要|关键词|引言|参考文献|目录)$/i.test(value) ||
    /^https?:\/\//i.test(value) ||
    /^[a-z0-9._%+-]+@[a-z0-9.-]+$/i.test(value) ||
    /^\d+$/.test(value)
  );
}

function looksLikeAuthorLine(text) {
  const value = String(text || '').trim();

  if (value.length < 2 || value.length > 250) return false;
  if (isNoiseLine(value)) return false;
  if (/@|university|college|institute|department|大学|学院|研究所|研究院/i.test(value)) {
    return false;
  }

  const westernNames =
    value.match(/\b[A-Z][a-zA-Z'’-]+\s+[A-Z][a-zA-Z'’-]+\b/g) || [];

  const chineseNameSegments = value
    .split(/[，,、;；]\s*/)
    .filter(part => /^[\u3400-\u9fff·]{2,8}$/.test(part.trim()));

  return westernNames.length >= 1 || chineseNameSegments.length >= 1;
}

function titleScore(line, medianFontSize) {
  let score = 0;
  const text = line.text.trim();

  if (line.page === 1) score += 20;
  if (line.fontSize > medianFontSize) {
    score += (line.fontSize - medianFontSize) * 8;
  }
  if (text.length >= 5 && text.length <= 180) score += 20;
  if (/[\u3400-\u9fffA-Za-z]/.test(text)) score += 10;
  if (isNoiseLine(text)) score -= 100;
  if (looksLikeAuthorLine(text)) score -= 30;
  if (/^(vol|volume|no|issue|journal|proceedings)/i.test(text)) {
    score -= 40;
  }

  return score;
}

export function extractLayoutMetadata(layout, embedded = {}) {
  const firstPageLines = layout.lines.filter(line => line.page === 1);
  const medianFontSize = median(
    firstPageLines.map(line => line.fontSize)
  );

  const ranked = firstPageLines
    .map(line => ({
      line,
      score: titleScore(line, medianFontSize)
    }))
    .sort((a, b) => b.score - a.score);

  const bestTitle = ranked[0]?.score > 0
    ? ranked[0].line
    : null;

  let authors = '';
  if (bestTitle) {
    const titleIndex = firstPageLines.indexOf(bestTitle);
    const candidates = firstPageLines.slice(
      titleIndex + 1,
      titleIndex + 6
    );

    const authorLine = candidates.find(line =>
      looksLikeAuthorLine(line.text)
    );

    authors = authorLine?.text || '';
  }

  const doi = normalizeDoi(layout.fullText);

  const yearMatch = layout.fullText.match(
    /\b(?:19|20)\d{2}\b/
  );

  return {
    title: embedded.title || bestTitle?.text || '',
    authors: embedded.authors || authors,
    year: embedded.year || yearMatch?.[0] || '',
    doi,
    journal: '',
    volume: '',
    issue: '',
    pages: '',
    abstract: '',
    keywords: '',
    type: 'article',
    _provenance: {
      title: {
        source: embedded.title ? 'pdf-metadata' : 'pdf-layout',
        confidence: embedded.title ? 0.9 : bestTitle ? 0.65 : 0
      },
      authors: {
        source: embedded.authors ? 'pdf-metadata' : 'pdf-layout',
        confidence: embedded.authors ? 0.85 : authors ? 0.55 : 0
      },
      year: {
        source: embedded.year ? 'pdf-metadata' : 'pdf-text',
        confidence: embedded.year ? 0.8 : yearMatch ? 0.45 : 0
      },
      doi: {
        source: doi ? 'pdf-text' : 'none',
        confidence: doi ? 0.95 : 0
      }
    }
  };
}

export async function fetchCrossrefByDoi(rawDoi) {
  const doi = normalizeDoi(rawDoi);
  if (!doi) return null;

  const response = await fetch(
    `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
    {
      headers: {
        Accept: 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Crossref 查询失败：HTTP ${response.status}`);
  }

  const json = await response.json();
  const work = json?.message;

  if (!work) return null;

  const dateParts =
    work.published?.['date-parts']?.[0] ||
    work.issued?.['date-parts']?.[0] ||
    [];

  return {
    title: work.title?.[0] || '',
    authors: (work.author || [])
      .map(author =>
        [author.given, author.family].filter(Boolean).join(' ')
      )
      .join(', '),
    journal: work['container-title']?.[0] || '',
    year: dateParts[0] ? String(dateParts[0]) : '',
    volume: work.volume || '',
    issue: work.issue || '',
    pages: work.page || '',
    doi,
    abstract: work.abstract || '',
    keywords: Array.isArray(work.subject)
      ? work.subject.join(', ')
      : '',
    type: 'article',
    _provenance: {
      title: { source: 'crossref', confidence: 0.98 },
      authors: { source: 'crossref', confidence: 0.98 },
      journal: { source: 'crossref', confidence: 0.98 },
      year: { source: 'crossref', confidence: 0.98 },
      doi: { source: 'pdf-text+crossref', confidence: 0.99 }
    }
  };
}
