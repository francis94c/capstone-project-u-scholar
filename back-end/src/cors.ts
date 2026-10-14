import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export function corsOptions(env: NodeJS.ProcessEnv = process.env): CorsOptions {
  const origins = new Set(
    (env.CORS_ORIGINS || 'http://localhost:8080')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );
  return {
    origin: (origin, callback) => {
      // Native mobile apps and server clients do not send an Origin header.
      if (!origin || origins.has(origin)) return callback(null, true);
      if (env.NODE_ENV !== 'production') {
        try {
          const url = new URL(origin);
          if (
            ['http:', 'https:'].includes(url.protocol) &&
            ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
            url.origin === origin
          ) {
            return callback(null, true);
          }
        } catch {
          // Malformed origins receive no CORS permission.
        }
      }
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  };
}
