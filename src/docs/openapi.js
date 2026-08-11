/** @type {import('openapi-types').OpenAPIV3.Document} */
const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Kisan Mall Staff Management API',
    description:
      'Admin + staff HR APIs.\n\n' +
      '1. `POST /auth/login` with mobile + password\n' +
      '2. Click **Authorize** and paste `Bearer <token>`\n\n' +
      'Admin paths: `/admin/*`. Staff paths: `/staff/*`.',
    version: '1.0.0',
    contact: { name: 'Kisan Mall' },
  },
  servers: [
    { url: 'http://localhost:5001/api', description: 'Local' },
  ],
  tags: [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'Admin Dashboard' },
    { name: 'Admin Employees' },
    { name: 'Admin Attendance' },
    { name: 'Admin Shifts' },
    { name: 'Admin Leaves' },
    { name: 'Admin Payroll' },
    { name: 'Staff' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT from POST /auth/login',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string' },
          message: { type: 'string' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['mobile', 'password'],
        properties: {
          mobile: { type: 'string', example: '9999999999' },
          password: { type: 'string', example: 'admin123' },
          portal: { type: 'string', enum: ['admin', 'staff'] },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login with mobile and password',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: { 200: { description: 'Token + user' } },
      },
    },
    '/admin/dashboard': {
      get: {
        tags: ['Admin Dashboard'],
        security: [{ BearerAuth: [] }],
        summary: 'Live attendance dashboard',
        responses: { 200: { description: 'Dashboard payload' } },
      },
    },
    '/admin/employees': {
      get: {
        tags: ['Admin Employees'],
        security: [{ BearerAuth: [] }],
        summary: 'List employees',
        responses: { 200: { description: 'Paged employees' } },
      },
    },
    '/staff/attendance/check-in': {
      post: {
        tags: ['Staff'],
        security: [{ BearerAuth: [] }],
        summary: 'Face check-in',
        responses: { 200: { description: 'Attendance marked' } },
      },
    },
  },
};

export default openApiSpec;
