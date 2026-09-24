/**
 * Parse issue identifier from goal title or string
 * @param {string} input 
 * @returns {object|null} { issueNumber, issueUrl }
 */
export function parseIssueRef(input) {
  if (!input || typeof input !== 'string') return null;
  const urlMatch = input.match(/https?:\/\/[^\s]+\/issues\/(\d+)/i);
  if (urlMatch) {
    return { issueNumber: parseInt(urlMatch[1], 10), issueUrl: urlMatch[0] };
  }
  const numMatch = input.match(/(?:issue:?|#)(\d+)\b/i);
  if (numMatch) {
    return { issueNumber: parseInt(numMatch[1], 10), issueUrl: null };
  }
  return null;
}

/**
 * Parse checklist items from markdown text
 * @param {string} markdown 
 * @returns {Array<{ text: string, done: boolean, raw: string }>}
 */
export function parseIssueChecklist(markdown) {
  if (!markdown || typeof markdown !== 'string') return [];
  const items = [];
  const lines = markdown.split('\n');
  const regex = /^\s*-\s*\[([ xX])\]\s*(.+)$/;

  for (const line of lines) {
    const match = line.match(regex);
    if (match) {
      items.push({
        done: match[1].toLowerCase() === 'x',
        text: match[2].trim(),
        raw: line,
      });
    }
  }
  return items;
}

/**
 * Update checklist item status in markdown text
 * @param {string} markdown 
 * @param {string} itemText 
 * @param {boolean} done 
 * @returns {string} updated markdown
 */
export function updateChecklistInMarkdown(markdown, itemText, done) {
  if (!markdown || typeof markdown !== 'string') return markdown || '';
  if (!itemText) return markdown;

  const targetClean = itemText.trim().toLowerCase();
  const lines = markdown.split('\n');
  const regex = /^(\s*-\s*\[)([ xX])(\]\s*)(.+)$/;

  return lines.map((line) => {
    const match = line.match(regex);
    if (match && match[4].trim().toLowerCase() === targetClean) {
      const checkChar = done ? 'x' : ' ';
      return `${match[1]}${checkChar}${match[3]}${match[4]}`;
    }
    return line;
  }).join('\n');
}
