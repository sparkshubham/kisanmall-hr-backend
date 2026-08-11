import swaggerUi from 'swagger-ui-express';
import openApiSpec from './openapi.js';

export function setupSwagger(app) {
  app.get('/api/docs.json', (_req, res) => {
    res.json(openApiSpec);
  });

  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: 'Kisan Mall Staff Management API',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'list',
        filter: true,
        tryItOutEnabled: true,
      },
    })
  );
}
