/**
 * Batch Request Validation Middleware
 *
 * Validates batch summarization requests
 */

const { MIN_TEXT_LENGTH, MAX_TEXT_LENGTH } = require('./validate');

const MAX_BATCH_SIZE = 10;
const MIN_BATCH_SIZE = 1;

function validateBatchRequest(req, res, next) {
  // Check content-type
  if (!req.is('application/json')) {
    return res.status(415).json({
      success: false,
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Content-Type must be application/json',
      },
      requestId: req.id,
    });
  }

  // Check for required items field
  if (!req.body.hasOwnProperty('items')) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Request body must include an "items" array',
        field: 'items',
      },
      requestId: req.id,
    });
  }

  const { items } = req.body;

  // Validate items is an array
  if (!Array.isArray(items)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_FIELD_TYPE',
        message: 'The "items" field must be an array',
        field: 'items',
        expectedType: 'array',
        receivedType: typeof items,
      },
      requestId: req.id,
    });
  }

  // Check batch size limits
  if (items.length < MIN_BATCH_SIZE) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'BATCH_TOO_SMALL',
        message: `Batch must contain at least ${MIN_BATCH_SIZE} item`,
        field: 'items',
        minSize: MIN_BATCH_SIZE,
        actualSize: items.length,
      },
      requestId: req.id,
    });
  }

  if (items.length > MAX_BATCH_SIZE) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'BATCH_TOO_LARGE',
        message: `Batch must not exceed ${MAX_BATCH_SIZE} items`,
        field: 'items',
        maxSize: MAX_BATCH_SIZE,
        actualSize: items.length,
      },
      requestId: req.id,
    });
  }

  // Validate each item in the batch
  const errors = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Validate item structure
    if (typeof item !== 'object' || item === null) {
      errors.push({
        index: i,
        code: 'INVALID_ITEM_TYPE',
        message: 'Each item must be an object',
      });
      continue;
    }

    // Validate text field
    if (!item.hasOwnProperty('text')) {
      errors.push({
        index: i,
        code: 'MISSING_TEXT_FIELD',
        message: 'Each item must have a "text" field',
      });
      continue;
    }

    if (typeof item.text !== 'string') {
      errors.push({
        index: i,
        code: 'INVALID_TEXT_TYPE',
        message: 'The "text" field must be a string',
      });
      continue;
    }

    const trimmedText = item.text.trim();

    // Check empty text
    if (trimmedText.length === 0) {
      errors.push({
        index: i,
        code: 'EMPTY_TEXT',
        message: 'Text cannot be empty',
      });
      continue;
    }

    // Check minimum length
    if (trimmedText.length < MIN_TEXT_LENGTH) {
      errors.push({
        index: i,
        code: 'TEXT_TOO_SHORT',
        message: `Text must be at least ${MIN_TEXT_LENGTH} characters`,
        minLength: MIN_TEXT_LENGTH,
        actualLength: trimmedText.length,
      });
      continue;
    }

    // Check maximum length
    if (item.text.length > MAX_TEXT_LENGTH) {
      errors.push({
        index: i,
        code: 'TEXT_TOO_LONG',
        message: `Text must not exceed ${MAX_TEXT_LENGTH} characters`,
        maxLength: MAX_TEXT_LENGTH,
        actualLength: item.text.length,
      });
      continue;
    }

    // Validate optional length parameter
    if (item.length !== undefined) {
      const validLengths = ['short', 'medium', 'long'];
      if (!validLengths.includes(item.length)) {
        errors.push({
          index: i,
          code: 'INVALID_LENGTH',
          message: `"length" must be one of: ${validLengths.join(', ')}`,
          allowedValues: validLengths,
        });
        continue;
      }
    }

    // Validate optional format parameter
    if (item.format !== undefined) {
      const validFormats = ['bullets', 'paragraph'];
      if (!validFormats.includes(item.format)) {
        errors.push({
          index: i,
          code: 'INVALID_FORMAT',
          message: `"format" must be one of: ${validFormats.join(', ')}`,
          allowedValues: validFormats,
        });
        continue;
      }
    }

    // Validate optional language parameter
    if (item.language !== undefined) {
      if (typeof item.language !== 'string') {
        errors.push({
          index: i,
          code: 'INVALID_LANGUAGE_TYPE',
          message: 'The "language" parameter must be a string',
        });
        continue;
      }

      if (item.language.trim().length === 0) {
        errors.push({
          index: i,
          code: 'EMPTY_LANGUAGE',
          message: 'The "language" parameter cannot be empty',
        });
        continue;
      }

      if (item.language.length > 50) {
        errors.push({
          index: i,
          code: 'LANGUAGE_TOO_LONG',
          message: 'The "language" parameter must not exceed 50 characters',
        });
        continue;
      }
    }

    // Sanitize text
    items[i].text = trimmedText.replace(/\s+/g, ' ');
  }

  // If there are validation errors, return them
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'BATCH_VALIDATION_ERRORS',
        message: `${errors.length} item(s) failed validation`,
        itemErrors: errors,
      },
      requestId: req.id,
    });
  }

  next();
}

module.exports = {
  validateBatchRequest,
  MAX_BATCH_SIZE,
  MIN_BATCH_SIZE,
};
