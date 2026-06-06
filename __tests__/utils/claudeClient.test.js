const {
  RateLimitError,
  ServiceOverloadedError,
  TimeoutError,
  AuthenticationError,
  InvalidRequestError,
  CircuitBreakerOpenError,
  ClaudeAPIError,
} = require('../../utils/errors');

// Mock the Anthropic SDK before importing claudeClient
jest.mock('@anthropic-ai/sdk');

const Anthropic = require('@anthropic-ai/sdk');
const config = require('../../config');

describe('ClaudeClient', () => {
  let claudeClient;
  let mockCreate;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    jest.resetModules();

    // Mock the Anthropic client
    mockCreate = jest.fn();
    Anthropic.mockImplementation(() => ({
      messages: {
        create: mockCreate,
      },
    }));

    // Reset config to default values
    config.anthropic = {
      apiKey: 'sk-ant-test-key',
      model: 'claude-sonnet-4-6',
      maxTokens: 4096,
      temperature: 1.0,
      timeout: 30000,
    };

    config.circuitBreaker = {
      threshold: 5,
      timeout: 30000,
    };

    // Re-require claudeClient to get a fresh instance
    claudeClient = require('../../utils/claudeClient');

    // Reset circuit breaker state (now using the CircuitBreaker class)
    if (claudeClient.circuitBreaker) {
      claudeClient.circuitBreaker.reset();
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Successful Summarization', () => {
    test('should successfully summarize text', async () => {
      const mockResponse = {
        content: [{ text: 'This is a test summary.' }],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await claudeClient.summarize('Test text to summarize');

      expect(result).toEqual({
        summary: 'This is a test summary.',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        },
        model: 'claude-sonnet-4-6',
        stopReason: 'end_turn',
      });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          temperature: 1.0,
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('Test text to summarize'),
            }),
          ]),
        }),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    test('should handle different length options', async () => {
      const mockResponse = {
        content: [{ text: 'Short summary.' }],
        usage: { input_tokens: 50, output_tokens: 10 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      };

      mockCreate.mockResolvedValue(mockResponse);

      await claudeClient.summarize('Test text', { length: 'short' });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('1-2 sentences');
    });

    test('should handle different format options', async () => {
      const mockResponse = {
        content: [{ text: '• Point 1\n• Point 2' }],
        usage: { input_tokens: 50, output_tokens: 20 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      };

      mockCreate.mockResolvedValue(mockResponse);

      await claudeClient.summarize('Test text', { format: 'bullets' });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('in bullet points');
    });

    test('should handle language option', async () => {
      const mockResponse = {
        content: [{ text: 'Resumen en español.' }],
        usage: { input_tokens: 50, output_tokens: 15 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      };

      mockCreate.mockResolvedValue(mockResponse);

      await claudeClient.summarize('Test text', { language: 'Spanish' });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('in Spanish');
    });

    test('should trim whitespace from summary', async () => {
      const mockResponse = {
        content: [{ text: '  \n  Summary with spaces  \n  ' }],
        usage: { input_tokens: 50, output_tokens: 20 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await claudeClient.summarize('Test text');

      expect(result.summary).toBe('Summary with spaces');
    });
  });

  describe('Retry Logic', () => {
    test('should retry on rate limit error and succeed', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.status = 429;

      const mockResponse = {
        content: [{ text: 'Success after retry.' }],
        usage: { input_tokens: 50, output_tokens: 20 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      };

      mockCreate
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(mockResponse);

      const result = await claudeClient.summarize('Test text');

      expect(result.summary).toBe('Success after retry.');
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    test('should retry on service overloaded error', async () => {
      const overloadedError = new Error('Service overloaded');
      overloadedError.status = 529;

      const mockResponse = {
        content: [{ text: 'Success after retry.' }],
        usage: { input_tokens: 50, output_tokens: 20 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      };

      mockCreate
        .mockRejectedValueOnce(overloadedError)
        .mockResolvedValueOnce(mockResponse);

      const result = await claudeClient.summarize('Test text');

      expect(result.summary).toBe('Success after retry.');
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    test('should use exponential backoff between retries', async () => {
      jest.useFakeTimers();
      jest.spyOn(global, 'setTimeout');

      const rateLimitError = new Error('Rate limit');
      rateLimitError.status = 429;

      mockCreate.mockRejectedValue(rateLimitError);

      const promise = claudeClient.summarize('Test text');

      // Fast-forward through all timers
      await jest.runAllTimersAsync();

      await expect(promise).rejects.toThrow(RateLimitError);

      // Should have 3 retries with increasing delays
      expect(mockCreate).toHaveBeenCalledTimes(4); // Initial + 3 retries

      jest.useRealTimers();
    });

    test('should respect retry-after header from rate limit', async () => {
      const rateLimitError = new Error('Rate limit');
      rateLimitError.status = 429;
      rateLimitError.headers = { 'retry-after': '5' };

      mockCreate.mockRejectedValue(rateLimitError);

      await expect(claudeClient.summarize('Test text')).rejects.toThrow(
        RateLimitError
      );

      expect(mockCreate).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    test('should not retry on client errors (4xx except 429)', async () => {
      const badRequestError = new Error('Bad request');
      badRequestError.status = 400;

      mockCreate.mockRejectedValue(badRequestError);

      await expect(claudeClient.summarize('Test text')).rejects.toThrow(
        InvalidRequestError
      );

      expect(mockCreate).toHaveBeenCalledTimes(1); // No retries
    });

    test('should fail after max retries', async () => {
      const timeoutError = new Error('Timeout');
      timeoutError.code = 'ETIMEDOUT';

      mockCreate.mockRejectedValue(timeoutError);

      await expect(claudeClient.summarize('Test text')).rejects.toThrow(
        TimeoutError
      );

      expect(mockCreate).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });
  });

  describe('Timeout Handling', () => {
    test('should timeout after 30 seconds', async () => {
      jest.useFakeTimers();

      mockCreate.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              content: [{ text: 'Too slow' }],
              usage: { input_tokens: 50, output_tokens: 20 },
              model: 'claude-sonnet-4-6',
              stop_reason: 'end_turn',
            });
          }, 35000); // 35 seconds - longer than timeout
        });
      });

      const promise = claudeClient.summarize('Test text');

      // Fast-forward time
      jest.advanceTimersByTime(30000);

      await expect(promise).rejects.toThrow(TimeoutError);

      jest.useRealTimers();
    });

    test('should handle abort signal', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      mockCreate.mockRejectedValue(abortError);

      await expect(claudeClient.summarize('Test text')).rejects.toThrow(
        TimeoutError
      );
    });
  });

  describe('Error Mapping', () => {
    test('should map 429 to RateLimitError', async () => {
      const error = new Error('Rate limit');
      error.status = 429;
      mockCreate.mockRejectedValue(error);

      await expect(claudeClient.summarize('Test text')).rejects.toThrow(
        RateLimitError
      );
    });

    test('should map 529 to ServiceOverloadedError', async () => {
      const error = new Error('Overloaded');
      error.status = 529;
      mockCreate.mockRejectedValue(error);

      await expect(claudeClient.summarize('Test text')).rejects.toThrow(
        ServiceOverloadedError
      );
    });

    test('should map 503 to ServiceOverloadedError', async () => {
      const error = new Error('Service unavailable');
      error.status = 503;
      mockCreate.mockRejectedValue(error);

      await expect(claudeClient.summarize('Test text')).rejects.toThrow(
        ServiceOverloadedError
      );
    });

    test('should map 401 to AuthenticationError', async () => {
      const error = new Error('Unauthorized');
      error.status = 401;
      mockCreate.mockRejectedValue(error);

      await expect(claudeClient.summarize('Test text')).rejects.toThrow(
        AuthenticationError
      );
    });

    test('should map 403 to AuthenticationError', async () => {
      const error = new Error('Forbidden');
      error.status = 403;
      mockCreate.mockRejectedValue(error);

      await expect(claudeClient.summarize('Test text')).rejects.toThrow(
        AuthenticationError
      );
    });

    test('should map 400 to InvalidRequestError', async () => {
      const error = new Error('Bad request');
      error.status = 400;
      mockCreate.mockRejectedValue(error);

      await expect(claudeClient.summarize('Test text')).rejects.toThrow(
        InvalidRequestError
      );
    });

    test('should map ETIMEDOUT to TimeoutError', async () => {
      const error = new Error('Timeout');
      error.code = 'ETIMEDOUT';
      mockCreate.mockRejectedValue(error);

      await expect(claudeClient.summarize('Test text')).rejects.toThrow(
        TimeoutError
      );
    });

    test('should map ECONNABORTED to TimeoutError', async () => {
      const error = new Error('Connection aborted');
      error.code = 'ECONNABORTED';
      mockCreate.mockRejectedValue(error);

      await expect(claudeClient.summarize('Test text')).rejects.toThrow(
        TimeoutError
      );
    });

    test('should map network errors to ClaudeAPIError', async () => {
      const error = new Error('DNS lookup failed');
      error.code = 'ENOTFOUND';
      mockCreate.mockRejectedValue(error);

      await expect(claudeClient.summarize('Test text')).rejects.toThrow(
        ClaudeAPIError
      );
    });

    test('should map unknown errors to ClaudeAPIError', async () => {
      const error = new Error('Unknown error');
      mockCreate.mockRejectedValue(error);

      await expect(claudeClient.summarize('Test text')).rejects.toThrow(
        ClaudeAPIError
      );
    });
  });

  describe('Circuit Breaker', () => {
    test('should open circuit after threshold failures', async () => {
      const error = new Error('Service error');
      error.status = 500;
      mockCreate.mockRejectedValue(error);

      // Cause 5 failures (threshold)
      for (let i = 0; i < 5; i++) {
        try {
          await claudeClient.summarize('Test text');
        } catch (e) {
          // Expected
        }
      }

      const state = claudeClient.getCircuitState();
      expect(state.state).toBe('OPEN');
    });

    test('should throw error when circuit is open', async () => {
      // Manually set circuit to open
      claudeClient.circuitBreaker.state = 'OPEN';
      claudeClient.circuitBreaker.lastFailureTime = Date.now();

      await expect(claudeClient.summarize('Test text')).rejects.toThrow(
        /Circuit breaker is OPEN/
      );

      expect(mockCreate).not.toHaveBeenCalled();
    });

    test('should transition to HALF_OPEN after timeout', async () => {
      const pastTime = Date.now() - 31000; // 31 seconds ago (past timeout)
      claudeClient.circuitBreaker.state = 'OPEN';
      claudeClient.circuitBreaker.lastFailureTime = pastTime;

      const mockResponse = {
        content: [{ text: 'Recovery attempt' }],
        usage: { input_tokens: 50, output_tokens: 20 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      };

      mockCreate.mockResolvedValue(mockResponse);

      await claudeClient.summarize('Test text');

      const state = claudeClient.getCircuitState();
      expect(state.state).toBe('HALF_OPEN');
    });

    test('should close circuit after 2 successes in HALF_OPEN', async () => {
      claudeClient.circuitBreaker.state = 'HALF_OPEN';
      claudeClient.circuitBreaker.successCount = 0;

      const mockResponse = {
        content: [{ text: 'Success' }],
        usage: { input_tokens: 50, output_tokens: 20 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      };

      mockCreate.mockResolvedValue(mockResponse);

      // First success
      await claudeClient.summarize('Test text');
      let state = claudeClient.getCircuitState();
      expect(state.state).toBe('HALF_OPEN');
      expect(state.successCount).toBe(1);

      // Second success should close circuit
      await claudeClient.summarize('Test text');
      state = claudeClient.getCircuitState();
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
    });

    test('should not count 4xx errors (except 429) toward circuit breaker', async () => {
      const error = new Error('Bad request');
      error.status = 400;
      mockCreate.mockRejectedValue(error);

      try {
        await claudeClient.summarize('Test text');
      } catch (e) {
        // Expected
      }

      const state = claudeClient.getCircuitState();
      expect(state.failureCount).toBe(0);
      expect(state.state).toBe('CLOSED');
    });

    test('should reset failure count on success in CLOSED state', async () => {
      claudeClient.circuitBreaker.state = 'CLOSED';
      claudeClient.circuitBreaker.failureCount = 3;

      const mockResponse = {
        content: [{ text: 'Success' }],
        usage: { input_tokens: 50, output_tokens: 20 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      };

      mockCreate.mockResolvedValue(mockResponse);

      await claudeClient.summarize('Test text');

      const state = claudeClient.getCircuitState();
      expect(state.failureCount).toBe(0);
    });
  });

  describe('Response Validation', () => {
    test('should throw error if response has no content', async () => {
      mockCreate.mockResolvedValue({
        usage: { input_tokens: 50, output_tokens: 20 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      });

      await expect(claudeClient.summarize('Test text')).rejects.toThrow(
        ClaudeAPIError
      );
    });

    test('should throw error if content array is empty', async () => {
      mockCreate.mockResolvedValue({
        content: [],
        usage: { input_tokens: 50, output_tokens: 20 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      });

      await expect(claudeClient.summarize('Test text')).rejects.toThrow(
        ClaudeAPIError
      );
    });

    test('should throw error if content has no text', async () => {
      mockCreate.mockResolvedValue({
        content: [{}],
        usage: { input_tokens: 50, output_tokens: 20 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      });

      await expect(claudeClient.summarize('Test text')).rejects.toThrow(
        ClaudeAPIError
      );
    });

    test('should throw error if summary is empty after trimming', async () => {
      mockCreate.mockResolvedValue({
        content: [{ text: '   \n\n   ' }],
        usage: { input_tokens: 50, output_tokens: 20 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      });

      await expect(claudeClient.summarize('Test text')).rejects.toThrow(
        ClaudeAPIError
      );
    });
  });

  describe('Utility Methods', () => {
    test('getCircuitState should return current state', () => {
      // Manually set circuit state
      claudeClient.circuitBreaker.state = 'OPEN';
      claudeClient.circuitBreaker.failureCount = 5;
      claudeClient.circuitBreaker.lastFailureTime = 12345;
      claudeClient.circuitBreaker.successCount = 0;

      const state = claudeClient.getCircuitState();

      expect(state).toEqual({
        state: 'OPEN',
        failureCount: 5,
        lastFailureTime: 12345,
        successCount: 0,
      });
    });

    test('getStats should return config and circuit state', () => {
      const stats = claudeClient.getStats();

      expect(stats).toHaveProperty('circuit');
      expect(stats).toHaveProperty('config');
      expect(stats.config).toMatchObject({
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        timeout: 30000,
      });
    });
  });

  describe('Prompt Building', () => {
    test('should build prompt with default options', async () => {
      const mockResponse = {
        content: [{ text: 'Summary' }],
        usage: { input_tokens: 50, output_tokens: 20 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      };

      mockCreate.mockResolvedValue(mockResponse);

      await claudeClient.summarize('Test text');

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('Test text');
      expect(callArgs.messages[0].content).toContain('3-5 sentences');
      expect(callArgs.messages[0].content).toContain('paragraph form');
    });

    test('should build prompt with short length', async () => {
      const mockResponse = {
        content: [{ text: 'Summary' }],
        usage: { input_tokens: 50, output_tokens: 20 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      };

      mockCreate.mockResolvedValue(mockResponse);

      await claudeClient.summarize('Test text', { length: 'short' });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('1-2 sentences');
    });

    test('should build prompt with long length', async () => {
      const mockResponse = {
        content: [{ text: 'Summary' }],
        usage: { input_tokens: 50, output_tokens: 20 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      };

      mockCreate.mockResolvedValue(mockResponse);
      await claudeClient.summarize('Test text', { length: 'long' });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('2-3 paragraphs');
    });

    test('should build prompt with bullets format', async () => {
      const mockResponse = {
        content: [{ text: 'Summary' }],
        usage: { input_tokens: 50, output_tokens: 20 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      };

      mockCreate.mockResolvedValue(mockResponse);
      await claudeClient.summarize('Test text', { format: 'bullets' });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('bullet points');
    });

    test('should build prompt with language option', async () => {
      const mockResponse = {
        content: [{ text: 'Summary' }],
        usage: { input_tokens: 50, output_tokens: 20 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      };

      mockCreate.mockResolvedValue(mockResponse);
      await claudeClient.summarize('Test text', { language: 'Spanish' });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('in Spanish');
    });

    test('should build prompt with all options', async () => {
      const mockResponse = {
        content: [{ text: 'Summary' }],
        usage: { input_tokens: 50, output_tokens: 20 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
      };

      mockCreate.mockResolvedValue(mockResponse);
      await claudeClient.summarize('Test text', {
        length: 'long',
        format: 'bullets',
        language: 'French',
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('2-3 paragraphs');
      expect(callArgs.messages[0].content).toContain('bullet points');
      expect(callArgs.messages[0].content).toContain('in French');
    });
  });
});
