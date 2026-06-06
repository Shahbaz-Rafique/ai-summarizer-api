/**
 * Prompt Builder for Claude AI
 *
 * Handles construction of prompts for different summarization tasks
 */

class PromptBuilder {
  /**
   * Build a summarization prompt with specified options
   *
   * @param {string} text - Text to summarize
   * @param {Object} options - Summarization options
   * @param {string} options.length - 'short' | 'medium' | 'long'
   * @param {string} options.format - 'bullets' | 'paragraph'
   * @param {string} options.language - Output language (e.g., 'English', 'Spanish')
   * @returns {string} Formatted prompt
   */
  buildSummarizationPrompt(text, options = {}) {
    const length = options.length || 'medium';
    const format = options.format || 'paragraph';
    const { language } = options;

    // Get length specification
    const lengthSpec = this.getLengthSpecification(length);

    // Get format specification
    const formatSpec = this.getFormatSpecification(format);

    // Build the instruction
    let instruction = `Please provide a summary of the following text. The summary should be ${lengthSpec} and formatted ${formatSpec}.`;

    // Add language instruction if specified
    if (language) {
      instruction += ` Provide the summary in ${language}.`;
    }

    // Construct full prompt
    return `${instruction}

Text to summarize:
${text}

Summary:`;
  }

  /**
   * Get length specification text
   *
   * @param {string} length - Length option
   * @returns {string} Length specification
   */
  getLengthSpecification(length) {
    const specs = {
      short: '1-2 sentences',
      medium: 'a concise paragraph (3-5 sentences)',
      long: 'a detailed summary (2-3 paragraphs)',
    };

    return specs[length] || specs.medium;
  }

  /**
   * Get format specification text
   *
   * @param {string} format - Format option
   * @returns {string} Format specification
   */
  getFormatSpecification(format) {
    const specs = {
      bullets: 'in bullet points',
      paragraph: 'in paragraph form',
    };

    return specs[format] || specs.paragraph;
  }

  /**
   * Validate options before building prompt
   *
   * @param {Object} options - Options to validate
   * @throws {Error} If options are invalid
   */
  validateOptions(options = {}) {
    // Validate length
    if (options.length && !['short', 'medium', 'long'].includes(options.length)) {
      throw new Error(`Invalid length option: ${options.length}`);
    }

    // Validate format
    if (options.format && !['bullets', 'paragraph'].includes(options.format)) {
      throw new Error(`Invalid format option: ${options.format}`);
    }

    // Validate language (basic check)
    if (options.language && typeof options.language !== 'string') {
      throw new Error('Language must be a string');
    }

    if (options.language && options.language.length > 50) {
      throw new Error('Language name too long');
    }
  }

  /**
   * Get available options for summarization
   *
   * @returns {Object} Available options and their descriptions
   */
  getAvailableOptions() {
    return {
      length: {
        short: '1-2 sentences',
        medium: '3-5 sentences (concise paragraph)',
        long: '2-3 paragraphs (detailed summary)',
      },
      format: {
        bullets: 'Summary formatted as bullet points',
        paragraph: 'Summary formatted as continuous text',
      },
      language: {
        description: 'Output language for the summary',
        examples: ['English', 'Spanish', 'French', 'German', 'Japanese', 'Chinese'],
      },
    };
  }
}

// Export singleton instance
module.exports = new PromptBuilder();
