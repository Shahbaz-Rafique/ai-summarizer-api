const SUSPICIOUS_PATTERNS = [
  /ignore\s+(previous|above|all)\s+instructions?/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /\<\|im_start\|\>/i,
  /<\s*script\s*>/i,
];

const MIN_TEXT_LENGTH = 50;
const MAX_TEXT_LENGTH = 10000;

function validateSummarizeRequest(req, res, next) {
  // Check content-type
  if (!req.is('application/json')) {
    return res.status(415).json({
      success: false,
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Content-Type must be application/json',
      },
    });
  }

  // Check for required text field
  if (!req.body.hasOwnProperty('text')) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Request body must include a "text" field',
        field: 'text',
      },
    });
  }

  const { text } = req.body;

  // Validate text type
  if (typeof text !== 'string') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_FIELD_TYPE',
        message: 'The "text" field must be a string',
        field: 'text',
        expectedType: 'string',
        receivedType: typeof text,
      },
    });
  }

  // Trim whitespace for length validation
  const trimmedText = text.trim();

  // Check for empty text
  if (trimmedText.length === 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'EMPTY_TEXT',
        message: 'The "text" field cannot be empty or contain only whitespace',
        field: 'text',
      },
    });
  }

  // Check minimum length
  if (trimmedText.length < MIN_TEXT_LENGTH) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'TEXT_TOO_SHORT',
        message: `Text must be at least ${MIN_TEXT_LENGTH} characters (excluding whitespace)`,
        field: 'text',
        minLength: MIN_TEXT_LENGTH,
        actualLength: trimmedText.length,
      },
    });
  }

  // Check maximum length
  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(413).json({
      success: false,
      error: {
        code: 'TEXT_TOO_LONG',
        message: `Text must not exceed ${MAX_TEXT_LENGTH} characters`,
        field: 'text',
        maxLength: MAX_TEXT_LENGTH,
        actualLength: text.length,
      },
    });
  }

  // Check for null bytes
  if (text.includes('\0')) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_CHARACTER',
        message: 'Text contains invalid null bytes',
        field: 'text',
      },
    });
  }

  // Check for valid UTF-8 encoding
  try {
    const encoded = Buffer.from(text, 'utf8');
    const decoded = encoded.toString('utf8');
    if (decoded !== text) {
      throw new Error('Encoding mismatch');
    }
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_ENCODING',
        message: 'Text contains invalid UTF-8 characters',
        field: 'text',
      },
    });
  }

  // Check for suspicious patterns (prompt injection)
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(text)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SUSPICIOUS_INPUT',
          message: 'Text contains patterns that could indicate prompt injection attempts',
          field: 'text',
        },
      });
    }
  }

  // Validate optional 'length' parameter
  if (req.body.length !== undefined) {
    const validLengths = ['short', 'medium', 'long'];
    if (!validLengths.includes(req.body.length)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_LENGTH',
          message: `The "length" parameter must be one of: ${validLengths.join(', ')}`,
          field: 'length',
          allowedValues: validLengths,
          receivedValue: req.body.length,
        },
      });
    }
  }

  // Validate optional 'format' parameter
  if (req.body.format !== undefined) {
    const validFormats = ['bullets', 'paragraph'];
    if (!validFormats.includes(req.body.format)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FORMAT',
          message: `The "format" parameter must be one of: ${validFormats.join(', ')}`,
          field: 'format',
          allowedValues: validFormats,
          receivedValue: req.body.format,
        },
      });
    }
  }

  // Validate optional 'language' parameter
  if (req.body.language !== undefined) {
    if (typeof req.body.language !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FIELD_TYPE',
          message: 'The "language" parameter must be a string',
          field: 'language',
          expectedType: 'string',
          receivedType: typeof req.body.language,
        },
      });
    }

    const trimmedLanguage = req.body.language.trim();
    if (trimmedLanguage.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EMPTY_FIELD',
          message: 'The "language" parameter cannot be empty',
          field: 'language',
        },
      });
    }

    if (trimmedLanguage.length > 50) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'FIELD_TOO_LONG',
          message: 'The "language" parameter must not exceed 50 characters',
          field: 'language',
          maxLength: 50,
          actualLength: trimmedLanguage.length,
        },
      });
    }
  }

  // Sanitize text: trim whitespace and normalize multiple spaces
  req.body.text = trimmedText.replace(/\s+/g, ' ');

  // Validation passed
  next();
}

module.exports = {
  validateSummarizeRequest,
  MIN_TEXT_LENGTH,
  MAX_TEXT_LENGTH,
};
