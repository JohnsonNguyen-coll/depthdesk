import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';

export function openDatabase(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000');
  return {
    migrate() {
      db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)');
      const names = readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => name.endsWith('.sql')).sort();
      for (const name of names) {
        this.transaction(() => {
          if (db.prepare('SELECT name FROM schema_migrations WHERE name = ?').get(name)) return;
          db.exec(readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8'));
          db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
        });
      }
    },
    transaction(action) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = action();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    prepare(sql) {
      const statement = db.prepare(sql);
      function bound(args = []) {
        return {
          first: () => statement.get(...args) ?? null,
          all: () => ({ results: statement.all(...args) }),
          run: () => ({ meta: { changes: statement.run(...args).changes } })
        };
      }
      return { ...bound(), bind: (...args) => bound(args) };
    },
    batch(statements) {
      return this.transaction(() => statements.map(statement => statement.run()));
    },
    close: () => db.close()
  };
}
