import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { promisify } from 'node:util';
import { Store } from './store';
import { Ai, Assessment, Resource } from './ai';
const scrypt = promisify(scryptCb);
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export type Track = {
  id: string;
  topic: string;
  demo: boolean;
  scores: { skill: string; score: number }[];
  resources: Resource[];
  sources: string[];
};
@Injectable()
export class LearningService implements OnModuleInit, OnModuleDestroy {
  store = new Store();
  timer?: NodeJS.Timeout;
  mailBusy = false;
  building = new Set<string>();
  constructor(readonly ai: Ai) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.deliver(), 60000);
    this.timer.unref();
    void this.deliver();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
    this.store.db.close();
  }
  user(token?: string): any {
    if (!token?.startsWith('Bearer ')) throw new UnauthorizedException();
    const row = this.store.db
      .prepare(
        'SELECT users.* FROM users JOIN sessions ON users.id=sessions.user_id WHERE sessions.token=? AND expires>?',
      )
      .get(hash(token.slice(7)), Date.now());
    if (!row) throw new UnauthorizedException();
    return row;
  }
  profile(user: any) {
    const tracks = this.list(user.id);
    const completed = tracks
      .flatMap((t) => t.resources)
      .filter((r) => r.completedAt);
    const dates = new Set(completed.map((r) => r.completedAt!.slice(0, 10)));
    let streak = 0;
    const day = new Date();
    if (!dates.has(day.toISOString().slice(0, 10)))
      day.setUTCDate(day.getUTCDate() - 1);
    while (dates.has(day.toISOString().slice(0, 10))) {
      streak++;
      day.setUTCDate(day.getUTCDate() - 1);
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      reminder: user.reminder ? JSON.parse(user.reminder) : null,
      xp: completed.length * 100,
      level: Math.floor(completed.length / 5) + 1,
      streak,
      badges: [
        ...(completed.length ? ['First step'] : []),
        ...(tracks.some((t) => t.resources.every((r) => r.completedAt))
          ? ['Track finisher']
          : []),
      ],
    };
  }
  async auth(email: string, password: string, name?: string) {
    email = email.toLowerCase().trim();
    let user: any = this.store.db
      .prepare('SELECT * FROM users WHERE email=?')
      .get(email);
    if (name !== undefined) {
      if (user) throw new ConflictException('Email already registered.');
      const salt = randomBytes(16).toString('hex');
      const key = (await scrypt(password, salt, 64)) as Buffer;
      const id = randomUUID();
      try {
        this.store.db
          .prepare('INSERT INTO users(id,email,name,password) VALUES(?,?,?,?)')
          .run(id, email, name, `${salt}:${key.toString('hex')}`);
      } catch {
        throw new ConflictException('Email already registered.');
      }
      user = this.store.db.prepare('SELECT * FROM users WHERE id=?').get(id);
      this.queue(
        id,
        `welcome:${id}`,
        'Welcome to U-Scholar',
        `Hello ${name}, your learning journey starts here. Build a track and take your first step today.`,
      );
    } else {
      const [salt, key] = (
        user?.password || '0'.repeat(32) + ':' + '00'.repeat(64)
      ).split(':');
      const candidate = (await scrypt(password, salt, 64)) as Buffer;
      if (!user || !timingSafeEqual(candidate, Buffer.from(key, 'hex')))
        throw new UnauthorizedException('Invalid email or password.');
    }
    this.store.db
      .prepare('DELETE FROM sessions WHERE expires<?')
      .run(Date.now());
    const token = randomBytes(32).toString('hex');
    this.store.db
      .prepare('INSERT INTO sessions VALUES(?,?,?)')
      .run(hash(token), user.id, Date.now() + 7 * 86400000);
    void this.deliver();
    return { token, user: this.profile(user) };
  }
  logout(token: string) {
    this.store.db
      .prepare('DELETE FROM sessions WHERE token=?')
      .run(hash(token.slice(7)));
    return { ok: true };
  }
  async assess(topic: string) {
    const a = await this.ai.assess(topic);
    const id = randomBytes(32).toString('hex');
    this.store.db
      .prepare('DELETE FROM assessments WHERE expires<?')
      .run(Date.now());
    this.store.db
      .prepare('INSERT INTO assessments(id,data,expires) VALUES(?,?,?)')
      .run(id, JSON.stringify(a), Date.now() + 86400000);
    return {
      id,
      topic,
      demo: a.demo,
      questions: a.questions.map(({ correct, explanation, ...q }) => q),
    };
  }
  getAssessment(id: string): Assessment {
    const row: any = this.store.db
      .prepare('SELECT data FROM assessments WHERE id=? AND expires>?')
      .get(id, Date.now());
    if (!row) throw new NotFoundException('Assessment expired. Start again.');
    return JSON.parse(row.data);
  }
  answer(id: string, answers: number[]) {
    const a = this.getAssessment(id);
    if (a.answers) throw new ConflictException('Assessment already submitted.');
    if (answers.length !== a.questions.length)
      throw new BadRequestException('Answer every question.');
    a.answers = answers;
    this.store.db
      .prepare('UPDATE assessments SET data=? WHERE id=?')
      .run(JSON.stringify(a), id);
    return {
      id,
      demo: a.demo,
      scores: this.scores(a),
      message: 'Create an account or sign in to discover your learning track.',
    };
  }
  scores(a: Assessment) {
    const m = new Map<string, { sum: number; n: number }>();
    a.questions.forEach((q, i) => {
      const v = m.get(q.skill) || { sum: 0, n: 0 };
      v.sum += a.demo ? a.answers![i] / 3 : a.answers![i] === q.correct ? 1 : 0;
      v.n++;
      m.set(q.skill, v);
    });
    return [...m]
      .map(([skill, v]) => ({ skill, score: Math.round((v.sum / v.n) * 100) }))
      .sort((a, b) => a.score - b.score);
  }
  list(uid: string): Track[] {
    return (
      this.store.db
        .prepare('SELECT data FROM tracks WHERE user_id=? ORDER BY rowid DESC')
        .all(uid) as any[]
    ).map((r) => JSON.parse(r.data));
  }
  async generate(uid: string, id: string) {
    const row: any = this.store.db
      .prepare('SELECT owner FROM assessments WHERE id=?')
      .get(id);
    if (row?.owner && row.owner !== uid) throw new NotFoundException();
    const old = this.list(uid).find((t) => t.id === id);
    if (old) return old;
    if (this.building.has(id))
      throw new ConflictException('Track is being generated. Retry shortly.');
    const a = this.getAssessment(id);
    if (!a.answers)
      throw new BadRequestException('Complete the assessment first.');
    this.store.db
      .prepare('UPDATE assessments SET owner=? WHERE id=?')
      .run(uid, id);
    this.building.add(id);
    try {
      const scores = this.scores(a);
      const found = await this.ai.resources(a, scores);
      const track: Track = {
        id,
        topic: a.topic,
        demo: a.demo,
        scores,
        ...found,
        resources: found.resources.map((r) => ({
          ...r,
          id: randomUUID(),
          clicks: 0,
          notes: '',
        })) as Resource[],
      };
      this.store.db
        .prepare('INSERT INTO tracks VALUES(?,?,?)')
        .run(id, uid, JSON.stringify(track));
      return track;
    } finally {
      this.building.delete(id);
    }
  }
  resource(
    uid: string,
    tid: string,
    rid: string,
    action: string,
    notes?: string,
  ) {
    const t = this.list(uid).find((t) => t.id === tid);
    if (!t) throw new NotFoundException();
    const i = t.resources.findIndex((r) => r.id === rid);
    if (i < 0) throw new NotFoundException();
    if (i > 0 && !t.resources[i - 1].completedAt)
      throw new ConflictException('Complete the previous resource first.');
    const r = t.resources[i];
    if (action === 'open') r.clicks++;
    if (action === 'notes') r.notes = notes!;
    if (action === 'complete') {
      if (!r.clicks)
        throw new ConflictException(
          'Open the resource before marking it complete.',
        );
      r.completedAt ??= new Date().toISOString();
    }
    this.store.db
      .prepare('UPDATE tracks SET data=? WHERE id=? AND user_id=?')
      .run(JSON.stringify(t), tid, uid);
    return action === 'open' ? { url: r.url, clicks: r.clicks } : t;
  }
  reminder(uid: string, value: any) {
    if (
      value.enabled &&
      (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
    )
      throw new ServiceUnavailableException(
        'Email reminders require RESEND_API_KEY and a verified EMAIL_FROM.',
      );
    this.store.db
      .prepare('UPDATE users SET reminder=? WHERE id=?')
      .run(JSON.stringify(value), uid);
    this.store.db
      .prepare(
        "DELETE FROM mail WHERE user_id=? AND sent=0 AND id LIKE 'reminder:%'",
      )
      .run(uid);
    return value;
  }
  queue(uid: string, id: string, subject: string, body: string) {
    this.store.db
      .prepare(
        'INSERT OR IGNORE INTO mail(id,user_id,subject,body) VALUES(?,?,?,?)',
      )
      .run(id, uid, subject, body);
  }
  async deliver() {
    if (this.mailBusy || !process.env.RESEND_API_KEY) return;
    this.mailBusy = true;
    try {
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const time = now.toISOString().slice(11, 16);
      for (const u of this.store.db
        .prepare('SELECT * FROM users WHERE reminder IS NOT NULL')
        .all() as any[]) {
        const r = JSON.parse(u.reminder);
        if (r.enabled && r.days.includes(now.getUTCDay()) && time >= r.timeUtc)
          this.queue(
            u.id,
            `reminder:${u.id}:${date}`,
            'Your next step is waiting',
            `Hello ${u.name}, continue learning at ${process.env.APP_URL || 'U-Scholar'}. Disable reminders in app settings.`,
          );
      }
      for (const m of this.store.db
        .prepare(
          'SELECT mail.*,users.email FROM mail JOIN users ON users.id=mail.user_id WHERE sent=0 AND attempts<20 LIMIT 20',
        )
        .all() as any[]) {
        try {
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            signal: AbortSignal.timeout(15000),
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
              'Idempotency-Key': m.id,
            },
            body: JSON.stringify({
              from: process.env.EMAIL_FROM,
              to: [m.email],
              subject: m.subject,
              text: m.body,
            }),
          });
          if (!r.ok) throw new Error();
          this.store.db.prepare('UPDATE mail SET sent=1 WHERE id=?').run(m.id);
        } catch {
          this.store.db
            .prepare('UPDATE mail SET attempts=attempts+1 WHERE id=?')
            .run(m.id);
          console.warn('Email delivery failed; queued for retry.');
        }
      }
    } finally {
      this.mailBusy = false;
    }
  }
}
