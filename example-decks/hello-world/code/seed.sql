CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  created_at TEXT DEFAULT '2026-01-01'
);

INSERT INTO users (name, email, role, created_at) VALUES
  ('Alice Johnson', 'alice@example.com', 'admin', '2025-06-15'),
  ('Bob Smith', 'bob@example.com', 'user', '2025-08-20'),
  ('Carol Williams', 'carol@example.com', 'editor', '2025-09-10'),
  ('Dave Brown', 'dave@example.com', 'user', '2025-11-05'),
  ('Eve Davis', 'eve@example.com', 'admin', '2026-01-01');

CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  views INTEGER DEFAULT 0,
  published_at TEXT
);

INSERT INTO posts (user_id, title, views, published_at) VALUES
  (1, 'Getting Started with Lecta', 1250, '2026-01-15'),
  (1, 'Advanced SQL Techniques', 890, '2026-02-01'),
  (3, 'Python for Data Science', 2100, '2026-01-20'),
  (2, 'JavaScript Best Practices', 560, '2026-02-10'),
  (5, 'Building REST APIs', 1800, '2026-02-15');
