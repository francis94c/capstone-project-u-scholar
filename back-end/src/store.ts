import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export class Store {
  db: DatabaseSync;
  constructor(path = process.env.DATABASE_PATH || 'data/u-scholar.sqlite') {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,reminder TEXT);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS assessments(id TEXT PRIMARY KEY,data TEXT NOT NULL,expires INTEGER NOT NULL,owner TEXT);
      CREATE TABLE IF NOT EXISTS tracks(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mail(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),subject TEXT NOT NULL,body TEXT NOT NULL,sent INTEGER DEFAULT 0,attempts INTEGER DEFAULT 0);
    `);
  }
}
