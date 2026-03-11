import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WhatsApp Monitor API',
      version: '1.0.0',
      description: 'API for WhatsApp backup monitoring system',
    },
    servers: [{ url: 'http://localhost:3000' }],
    tags: [
      { name: 'Health', description: 'Server health' },
      { name: 'Phones', description: 'Agent phone management' },
      { name: 'Backup', description: 'Upload & process backups' },
      { name: 'Chats', description: 'Chat & message data' },
      { name: 'AI', description: 'AI insights & chat assistant' },
      { name: 'Logs', description: 'Pipeline logs' },
      { name: 'OAuth', description: 'Google Drive OAuth' },
      { name: 'Agent', description: 'Agent portal APIs' },
    ],
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Health check',
          responses: {
            200: {
              description: 'Server is running',
              content: {
                'application/json': {
                  example: { status: 'ok', uptime: 123, ai: 'configured', drive: 'configured' }
                }
              }
            }
          }
        }
      },
      '/api/phones': {
        get: {
          tags: ['Phones'],
          summary: 'Get all phones',
          responses: {
            200: { description: 'List of all agent phones' }
          }
        }
      },
      '/api/phones/{id}': {
        get: {
          tags: ['Phones'],
          summary: 'Get phone by ID',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: { description: 'Phone details' },
            404: { description: 'Phone not found' }
          }
        }
      },
      '/api/stats': {
        get: {
          tags: ['Phones'],
          summary: 'Get dashboard stats',
          responses: {
            200: {
              description: 'Stats',
              content: {
                'application/json': {
                  example: { totalPhones: 22, activePhones: 22, totalMessages: 0, successRate: 100 }
                }
              }
            }
          }
        }
      },
      '/api/upload-backup': {
        post: {
          tags: ['Backup'],
          summary: 'Upload and process a .crypt15 backup file',
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    file: { type: 'string', format: 'binary', description: '.crypt15 or .crypt14 file' },
                    phone_id: { type: 'string', format: 'uuid' },
                    phone_number: { type: 'string', example: '+919876543210' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Backup processed successfully' },
            400: { description: 'Invalid file or phone not found' }
          }
        }
      },
      '/api/test-decrypt': {
        post: {
          tags: ['Backup'],
          summary: 'Test decryption without saving to DB',
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    file: { type: 'string', format: 'binary' },
                    key: { type: 'string', example: 'f361784f7959830220c640b874b5e66226226cf1...', description: '64-char hex key' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Decryption test result' }
          }
        }
      },
      '/api/chats': {
        get: {
          tags: ['Chats'],
          summary: 'Get chats for a phone',
          parameters: [
            { name: 'phone_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } }
          ],
          responses: {
            200: { description: 'List of chats' }
          }
        }
      },
      '/api/messages': {
        get: {
          tags: ['Chats'],
          summary: 'Get messages for a chat',
          parameters: [
            { name: 'chat_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } }
          ],
          responses: {
            200: { description: 'List of messages' }
          }
        }
      },
      '/api/ai-insights': {
        get: {
          tags: ['AI'],
          summary: 'Get AI insights for a phone',
          parameters: [
            { name: 'phone_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'chat_id', in: 'query', schema: { type: 'string', format: 'uuid' } }
          ],
          responses: {
            200: { description: 'AI insights list' }
          }
        }
      },
      '/api/ai-insights/flagged': {
        get: {
          tags: ['AI'],
          summary: 'Get all flagged (red flag) chats',
          responses: {
            200: { description: 'Flagged insights' }
          }
        }
      },
      '/api/analyze/{phone_id}': {
        post: {
          tags: ['AI'],
          summary: 'Trigger AI analysis for a phone',
          parameters: [{ name: 'phone_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: { description: 'Analysis started' }
          }
        }
      },
      '/api/chat': {
        post: {
          tags: ['AI'],
          summary: 'Ask AI assistant about your data',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    question: { type: 'string', example: 'Which agent has the most messages?' },
                    history: { type: 'array', items: { type: 'object' }, default: [] }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'AI answer' }
          }
        }
      },
      '/api/logs': {
        get: {
          tags: ['Logs'],
          summary: 'Get pipeline logs',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'phone_id', in: 'query', schema: { type: 'string', format: 'uuid' } }
          ],
          responses: {
            200: { description: 'Pipeline logs' }
          }
        }
      },
      '/api/sync/{phone_id}': {
        post: {
          tags: ['OAuth'],
          summary: 'Manually trigger Google Drive sync for a phone',
          parameters: [{ name: 'phone_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: { description: 'Sync started' },
            400: { description: 'Drive not connected or no encryption key' }
          }
        }
      },
      '/api/oauth/auth-url/{phone_id}': {
        get: {
          tags: ['OAuth'],
          summary: 'Get Google OAuth URL for an agent',
          parameters: [{ name: 'phone_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: { description: 'OAuth URL' }
          }
        }
      },
      '/api/oauth/{phone_id}': {
        delete: {
          tags: ['OAuth'],
          summary: 'Disconnect Google Drive for a phone',
          parameters: [{ name: 'phone_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: { description: 'Disconnected' }
          }
        }
      },
      '/api/agent/list': {
        get: {
          tags: ['Agent'],
          summary: 'List all agents with email/drive status',
          responses: {
            200: { description: 'Agent list' }
          }
        }
      },
      '/api/agent/register': {
        post: {
          tags: ['Agent'],
          summary: 'Link Google email to a phone record',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    phone_id: { type: 'string', format: 'uuid' },
                    email: { type: 'string', format: 'email' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Email registered' }
          }
        }
      }
    }
  },
  apis: []
};

export const swaggerSpec = swaggerJsdoc(options);
