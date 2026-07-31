const Database = require("better-sqlite3");
const path = require("path");
const bcrypt = require("bcryptjs");
const fs = require("fs");

const dataDirectory = path.join(__dirname, "data");

if (!fs.existsSync(dataDirectory)) {
  fs.mkdirSync(dataDirectory, { recursive: true });
}
const dbPath = path.join(dataDirectory, "blog.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'author' CHECK(role IN ('admin', 'author')),
      bio TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id INTEGER NOT NULL,
      category_id INTEGER,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT NOT NULL,
      content TEXT NOT NULL,
      cover_image TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
      featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1)),
      views INTEGER NOT NULL DEFAULT 0,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(author_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      content TEXT NOT NULL,
      approved INTEGER NOT NULL DEFAULT 0 CHECK(approved IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
    CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
  `);

  const categoryCount = db.prepare("SELECT COUNT(*) AS count FROM categories").get().count;
  if (categoryCount === 0) {
    const insert = db.prepare("INSERT INTO categories (name, slug) VALUES (?, ?)");
    ["Technology", "Business", "Lifestyle", "Travel", "Health"].forEach(name => {
      insert.run(name, name.toLowerCase());
    });
  }

  const adminEmail = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const adminExists = db.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail);

  if (!adminExists) {
    const passwordHash = bcrypt.hashSync(adminPassword, 12);
    db.prepare(`
      INSERT INTO users (name, email, password_hash, role, bio)
      VALUES (?, ?, ?, 'admin', ?)
    `).run("Site Administrator", adminEmail, passwordHash, "Administrator and editor of the blog.");
  }

  const postCount = db.prepare("SELECT COUNT(*) AS count FROM posts").get().count;
  if (postCount === 0) {
    const admin = db.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail);
    const tech = db.prepare("SELECT id FROM categories WHERE slug = 'technology'").get();
    const business = db.prepare("SELECT id FROM categories WHERE slug = 'business'").get();

    const insertPost = db.prepare(`
      INSERT INTO posts
      (author_id, category_id, title, slug, excerpt, content, cover_image, status, featured, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, CURRENT_TIMESTAMP)
    `);

    insertPost.run(
      admin.id,
      tech.id,
      "How Artificial Intelligence Is Changing Everyday Work",
      "how-artificial-intelligence-is-changing-everyday-work",
      "A practical look at how modern AI tools can improve productivity without replacing human judgment.",
      `<h2>AI is becoming a daily work tool</h2>
       <p>Artificial intelligence is no longer limited to research laboratories. Writers, designers, business owners, analysts and customer-support teams now use AI to complete repetitive work faster.</p>
       <h2>Where AI helps most</h2>
       <p>AI can summarize documents, organize information, suggest ideas, automate routine communication and help teams find patterns in large amounts of data.</p>
       <blockquote>The strongest results come when AI supports a clear human decision-making process.</blockquote>
       <h2>Responsible adoption</h2>
       <p>Organizations should verify important outputs, protect private information and keep humans responsible for final decisions.</p>`,
      "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1400&q=80",
      1
    );

    insertPost.run(
      admin.id,
      business.id,
      "Seven Simple Habits That Help Small Businesses Grow",
      "seven-simple-habits-that-help-small-businesses-grow",
      "Sustainable growth usually comes from consistent habits rather than one dramatic breakthrough.",
      `<h2>Start with the customer</h2>
       <p>Speak to customers regularly and use their feedback to improve the offer, buying process and after-sales service.</p>
       <h2>Measure a few useful numbers</h2>
       <p>Track revenue, expenses, leads, conversion rate and repeat customers. A small set of accurate numbers is more useful than a complicated dashboard.</p>
       <h2>Build reliable systems</h2>
       <p>Document recurring tasks, assign clear ownership and automate steps that do not require human judgment.</p>`,
      "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1400&q=80",
      0
    );
  }
}

module.exports = { db, initializeDatabase };
