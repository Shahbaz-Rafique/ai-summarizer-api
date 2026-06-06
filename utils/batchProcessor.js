/**
 * Batch Processor with Concurrency Control
 *
 * Processes multiple items concurrently with a configurable concurrency limit
 * Handles partial failures gracefully
 */

class BatchProcessor {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 3;
  }

  /**
   * Process items in batches with concurrency control
   *
   * @param {Array} items - Items to process
   * @param {Function} processor - Async function to process each item
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Results with successes and failures
   */
  async process(items, processor, options = {}) {
    const results = {
      successes: [],
      failures: [],
      totalItems: items.length,
      successCount: 0,
      failureCount: 0,
    };

    // Queue of items to process
    const queue = [...items];
    const activePromises = new Set();

    // Track processing order
    let completedCount = 0;

    while (queue.length > 0 || activePromises.size > 0) {
      // Start new tasks up to concurrency limit
      while (queue.length > 0 && activePromises.size < this.concurrency) {
        const item = queue.shift();
        const index = items.indexOf(item);

        const promise = this.processItem(item, index, processor, options)
          .then((result) => {
            completedCount++;

            if (result.success) {
              results.successes.push({
                index,
                data: result.data,
              });
              results.successCount++;
            } else {
              results.failures.push({
                index,
                error: result.error,
              });
              results.failureCount++;
            }

            // Call progress callback if provided
            if (options.onProgress) {
              options.onProgress({
                completed: completedCount,
                total: items.length,
                successCount: results.successCount,
                failureCount: results.failureCount,
              });
            }
          })
          .finally(() => {
            activePromises.delete(promise);
          });

        activePromises.add(promise);
      }

      // Wait for at least one to complete before starting more
      if (activePromises.size > 0) {
        await Promise.race(activePromises);
      }
    }

    return results;
  }

  /**
   * Process a single item with error handling
   *
   * @param {*} item - Item to process
   * @param {number} index - Item index in original array
   * @param {Function} processor - Processing function
   * @param {Object} options - Options
   * @returns {Promise<Object>} Result object
   * @private
   */
  async processItem(item, index, processor, options) {
    try {
      const data = await processor(item, index);
      return {
        success: true,
        data,
      };
    } catch (error) {
      // Log error if logger provided
      if (options.logger) {
        options.logger.error({
          message: 'Batch item processing failed',
          index,
          error: error.message,
          code: error.code,
        });
      }

      return {
        success: false,
        error: {
          code: error.code || 'PROCESSING_ERROR',
          message: error.message || 'Unknown error',
          retryable: error.retryable,
        },
      };
    }
  }

  /**
   * Process items with simple Promise.all (no concurrency limit)
   * Useful for small batches or when concurrency isn't a concern
   *
   * @param {Array} items - Items to process
   * @param {Function} processor - Processing function
   * @returns {Promise<Object>} Results
   */
  async processAll(items, processor) {
    const results = await Promise.allSettled(
      items.map((item, index) => processor(item, index)),
    );

    const successes = [];
    const failures = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successes.push({
          index,
          data: result.value,
        });
      } else {
        failures.push({
          index,
          error: {
            code: result.reason?.code || 'PROCESSING_ERROR',
            message: result.reason?.message || 'Unknown error',
            retryable: result.reason?.retryable,
          },
        });
      }
    });

    return {
      successes,
      failures,
      totalItems: items.length,
      successCount: successes.length,
      failureCount: failures.length,
    };
  }

  /**
   * Check if batch processing was fully successful
   *
   * @param {Object} results - Results from process()
   * @returns {boolean} True if all items succeeded
   */
  static isFullSuccess(results) {
    return results.failureCount === 0;
  }

  /**
   * Check if batch processing was partial success
   *
   * @param {Object} results - Results from process()
   * @returns {boolean} True if some succeeded and some failed
   */
  static isPartialSuccess(results) {
    return results.successCount > 0 && results.failureCount > 0;
  }

  /**
   * Check if batch processing was total failure
   *
   * @param {Object} results - Results from process()
   * @returns {boolean} True if all items failed
   */
  static isTotalFailure(results) {
    return results.successCount === 0;
  }
}

module.exports = BatchProcessor;
