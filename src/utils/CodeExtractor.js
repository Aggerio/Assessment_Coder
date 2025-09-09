class CodeExtractor {
  constructor() {
    // Regular expression to match code blocks between ``` markers
    this.codeBlockRegex = /```(?:(\w+)\n)?([\s\S]*?)```/g;
  }

  /**
   * Extract all code snippets from AI response text
   * @param {string} responseText - The AI response text
   * @returns {Array} Array of code snippet objects with language and code
   */
  extractCodeSnippets(responseText) {
    if (!responseText || typeof responseText !== 'string') {
      return [];
    }

    const codeSnippets = [];
    let match;

    // Reset regex to start from beginning
    this.codeBlockRegex.lastIndex = 0;

    while ((match = this.codeBlockRegex.exec(responseText)) !== null) {
      const language = match[1] || 'unknown';
      const code = match[2].trim();
      
      if (code.length > 0) {
        codeSnippets.push({
          language: language,
          code: code,
          index: codeSnippets.length,
          preview: this.createPreview(code, 50)
        });
      }
    }

    return codeSnippets;
  }

  /**
   * Get the most recent code snippet from response
   * @param {string} responseText - The AI response text
   * @returns {Object|null} Most recent code snippet or null
   */
  getLatestCodeSnippet(responseText) {
    const snippets = this.extractCodeSnippets(responseText);
    return snippets.length > 0 ? snippets[snippets.length - 1] : null;
  }

  /**
   * Get the largest code snippet from response (likely the main answer)
   * @param {string} responseText - The AI response text
   * @returns {Object|null} Largest code snippet or null
   */
  getLargestCodeSnippet(responseText) {
    const snippets = this.extractCodeSnippets(responseText);
    if (snippets.length === 0) return null;

    return snippets.reduce((largest, current) => {
      return current.code.length > largest.code.length ? current : largest;
    });
  }

  /**
   * Create a preview string for a code snippet
   * @param {string} code - The code to preview
   * @param {number} maxLength - Maximum length of preview
   * @returns {string} Preview string
   */
  createPreview(code, maxLength = 50) {
    const firstLine = code.split('\n')[0].trim();
    if (firstLine.length <= maxLength) {
      return firstLine;
    }
    return firstLine.substring(0, maxLength - 3) + '...';
  }

  /**
   * Clean code for typing (remove extra whitespace, normalize line endings)
   * @param {string} code - Raw code string
   * @returns {string} Cleaned code ready for typing
   */
  cleanCodeForTyping(code) {
    if (!code) return '';
    
    // Normalize line endings to system default
    const normalizedCode = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Remove trailing whitespace from each line but preserve indentation
    const lines = normalizedCode.split('\n').map(line => line.trimEnd());
    
    return lines.join('\n');
  }
}

module.exports = CodeExtractor; 