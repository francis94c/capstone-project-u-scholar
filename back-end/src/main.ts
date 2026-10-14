import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  Module,
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { Ai } from './ai';
import { LearningService } from './service';
import { corsOptions } from './cors';
function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success)
    throw new BadRequestException(
      r.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; '),
    );
  return r.data;
}
const credentials = z
  .object({
    email: z.string().trim().email().max(254),
    password: z.string().min(10).max(128),
  })
  .strict();
@Controller('api')
class ApiController {
  constructor(private readonly app: LearningService) {}
  @Get('health') health() {
    return { status: 'ok', demo: this.app.ai.demo };
  }
  @Post('auth/register') register(@Body() b: unknown) {
    const v = parse(
      credentials.extend({ name: z.string().trim().min(1).max(80) }),
      b,
    );
    return this.app.auth(v.email, v.password, v.name);
  }
  @Post('auth/login') login(@Body() b: unknown) {
    const v = parse(credentials, b);
    return this.app.auth(v.email, v.password);
  }
  @Post('auth/logout') logout(@Headers('authorization') h: string) {
    this.app.user(h);
    return this.app.logout(h);
  }
  @Get('me') me(@Headers('authorization') h: string) {
    return this.app.profile(this.app.user(h));
  }
  @Post('assessments') assess(@Body() b: unknown) {
    return this.app.assess(
      parse(z.object({ topic: z.string().trim().min(2).max(200) }).strict(), b)
        .topic,
    );
  }
  @Post('assessments/:id/answers') answers(
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.app.answer(
      id,
      parse(
        z
          .object({
            answers: z.array(z.number().int().min(0).max(3)).min(4).max(12),
          })
          .strict(),
        b,
      ).answers,
    );
  }
  @Get('tracks') tracks(@Headers('authorization') h: string) {
    return this.app.list(this.app.user(h).id);
  }
  @Post('tracks') generate(
    @Headers('authorization') h: string,
    @Body() b: unknown,
  ) {
    const u = this.app.user(h);
    return this.app.generate(
      u.id,
      parse(z.object({ assessmentId: z.string().length(64) }).strict(), b)
        .assessmentId,
    );
  }
  @Post('tracks/:tid/resources/:rid/open') open(
    @Headers('authorization') h: string,
    @Param('tid') t: string,
    @Param('rid') r: string,
  ) {
    return this.app.resource(this.app.user(h).id, t, r, 'open');
  }
  @Post('tracks/:tid/resources/:rid/complete') complete(
    @Headers('authorization') h: string,
    @Param('tid') t: string,
    @Param('rid') r: string,
  ) {
    return this.app.resource(this.app.user(h).id, t, r, 'complete');
  }
  @Put('tracks/:tid/resources/:rid/notes') notes(
    @Headers('authorization') h: string,
    @Param('tid') t: string,
    @Param('rid') r: string,
    @Body() b: unknown,
  ) {
    return this.app.resource(
      this.app.user(h).id,
      t,
      r,
      'notes',
      parse(z.object({ notes: z.string().max(20000) }).strict(), b).notes,
    );
  }
  @Put('me/reminder') reminder(
    @Headers('authorization') h: string,
    @Body() b: unknown,
  ) {
    return this.app.reminder(
      this.app.user(h).id,
      parse(
        z
          .object({
            enabled: z.boolean(),
            timeUtc: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
            days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
          })
          .strict(),
        b,
      ),
    );
  }
}
@Module({ controllers: [ApiController], providers: [Ai, LearningService] })
export class AppModule {}
export async function createApp() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableCors(corsOptions());
  const express = await import('express');
  app.use(express.json({ limit: '32kb' }));
  app.use(helmet());
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 60,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  app.use('/api/assessments', rateLimit({ windowMs: 3600000, limit: 20 }));
  app.use('/api/auth', rateLimit({ windowMs: 900000, limit: 20 }));
  app.use(
    '/api/tracks',
    rateLimit({
      windowMs: 3600000,
      limit: 10,
      skip: (req) => req.method !== 'POST' || req.path !== '/',
    }),
  );
  return app;
}
if (require.main === module) {
  void createApp().then((app) =>
    app.listen(Number(process.env.PORT) || 3000, '0.0.0.0'),
  );
}
