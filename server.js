require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const slugify = require("slugify");

const { db, initializeDatabase } = require("./db");
const { authenticate, requireAdmin } = require("./middleware");

initializeDatabase();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "development-secret";

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use(express.static(path.join(__dirname, "public")));

function cleanText(value, max = 10000) {
  return String(value || "").trim().slice(0, max);
}

function createUniqueSlug(title, currentId = null) {
  const base = slugify(title, { lower: true, strict: true }) || `post-${Date.now()}`;
  let candidate = base;
  let suffix = 1;

  while (true) {
    const row = currentId
      ? db.prepare("SELECT id FROM posts WHERE slug = ? AND id != ?").get(candidate, currentId)
      : db.prepare("SELECT id FROM posts WHERE slug = ?").get(candidate);

    if (!row) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}

function signUser(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/api/auth/register", async (req, res) => {
  const name = cleanText(req.body.name, 80);
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "");

  if (!name || !email || password.length < 8) {
    return res.status(400).json({
      message: "Name, valid email and a password of at least 8 characters are required."
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, 'author')
    `).run(name, email, passwordHash);

    const user = db.prepare("SELECT id, name, email, role, bio FROM users WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json({ token: signUser(user), user });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({ message: "An account with that email already exists." });
    }
    res.status(500).json({ message: "Could not create account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: "Incorrect email or password." });
  }

  const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role, bio: user.bio };
  res.json({ token: signUser(safeUser), user: safeUser });
});

app.get("/api/auth/me", authenticate, (req, res) => {
  const user = db.prepare("SELECT id, name, email, role, bio, created_at FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ message: "User not found." });
  res.json(user);
});

app.get("/api/categories", (req, res) => {
  const categories = db.prepare(`
    SELECT c.*, COUNT(p.id) AS post_count
    FROM categories c
    LEFT JOIN posts p ON p.category_id = c.id AND p.status = 'published'
    GROUP BY c.id
    ORDER BY c.name
  `).all();
  res.json(categories);
});

app.get("/api/posts", (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 9), 1), 30);
  const offset = (page - 1) * limit;
  const search = cleanText(req.query.search, 120);
  const category = cleanText(req.query.category, 80);
  const featured = req.query.featured === "true";

  const where = ["p.status = 'published'"];
  const params = {};

  if (search) {
    where.push("(p.title LIKE @search OR p.excerpt LIKE @search OR p.content LIKE @search)");
    params.search = `%${search}%`;
  }
  if (category) {
    where.push("c.slug = @category");
    params.category = category;
  }
  if (featured) where.push("p.featured = 1");

  const whereSql = where.join(" AND ");

  const total = db.prepare(`
    SELECT COUNT(*) AS count
    FROM posts p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${whereSql}
  `).get(params).count;

  const posts = db.prepare(`
    SELECT p.id, p.title, p.slug, p.excerpt, p.cover_image, p.featured,
           p.views, p.published_at, p.created_at,
           u.name AS author_name,
           c.name AS category_name, c.slug AS category_slug,
           (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id AND cm.approved = 1) AS comment_count
    FROM posts p
    JOIN users u ON u.id = p.author_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${whereSql}
    ORDER BY p.featured DESC, COALESCE(p.published_at, p.created_at) DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });

  res.json({
    posts,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(Math.ceil(total / limit), 1)
    }
  });
});

app.get("/api/posts/:slug", (req, res) => {
  const post = db.prepare(`
    SELECT p.*, u.name AS author_name, u.bio AS author_bio,
           c.name AS category_name, c.slug AS category_slug
    FROM posts p
    JOIN users u ON u.id = p.author_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.slug = ? AND p.status = 'published'
  `).get(req.params.slug);

  if (!post) return res.status(404).json({ message: "Post not found." });

  db.prepare("UPDATE posts SET views = views + 1 WHERE id = ?").run(post.id);
  post.views += 1;

  const comments = db.prepare(`
    SELECT id, name, content, created_at
    FROM comments
    WHERE post_id = ? AND approved = 1
    ORDER BY created_at DESC
  `).all(post.id);

  res.json({ ...post, comments });
});

app.post("/api/posts/:slug/comments", (req, res) => {
  const post = db.prepare("SELECT id FROM posts WHERE slug = ? AND status = 'published'").get(req.params.slug);
  if (!post) return res.status(404).json({ message: "Post not found." });

  const name = cleanText(req.body.name, 80);
  const email = cleanText(req.body.email, 160).toLowerCase();
  const content = cleanText(req.body.content, 1200);

  if (!name || !email || !content) {
    return res.status(400).json({ message: "Name, email and comment are required." });
  }

  const result = db.prepare(`
    INSERT INTO comments (post_id, name, email, content, approved)
    VALUES (?, ?, ?, ?, 0)
  `).run(post.id, name, email, content);

  res.status(201).json({
    id: result.lastInsertRowid,
    message: "Comment submitted and awaiting approval."
  });
});

app.get("/api/dashboard/stats", authenticate, (req, res) => {
  const authorFilter = req.user.role === "admin" ? "" : "WHERE author_id = @userId";
  const postStats = db.prepare(`
    SELECT
      COUNT(*) AS total_posts,
      SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published_posts,
      SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft_posts,
      COALESCE(SUM(views), 0) AS total_views
    FROM posts
    ${authorFilter}
  `).get({ userId: req.user.id });

  const pendingComments = req.user.role === "admin"
    ? db.prepare("SELECT COUNT(*) AS count FROM comments WHERE approved = 0").get().count
    : db.prepare(`
        SELECT COUNT(*) AS count
        FROM comments cm JOIN posts p ON p.id = cm.post_id
        WHERE cm.approved = 0 AND p.author_id = ?
      `).get(req.user.id).count;

  res.json({ ...postStats, pending_comments: pendingComments });
});

app.get("/api/dashboard/posts", authenticate, (req, res) => {
  const posts = req.user.role === "admin"
    ? db.prepare(`
        SELECT p.id, p.title, p.slug, p.status, p.featured, p.views, p.created_at,
               p.updated_at, u.name AS author_name, c.name AS category_name
        FROM posts p JOIN users u ON u.id = p.author_id
        LEFT JOIN categories c ON c.id = p.category_id
        ORDER BY p.updated_at DESC
      `).all()
    : db.prepare(`
        SELECT p.id, p.title, p.slug, p.status, p.featured, p.views, p.created_at,
               p.updated_at, u.name AS author_name, c.name AS category_name
        FROM posts p JOIN users u ON u.id = p.author_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.author_id = ?
        ORDER BY p.updated_at DESC
      `).all(req.user.id);

  res.json(posts);
});

app.post("/api/dashboard/posts", authenticate, (req, res) => {
  const title = cleanText(req.body.title, 180);
  const excerpt = cleanText(req.body.excerpt, 500);
  const content = cleanText(req.body.content, 50000);
  const coverImage = cleanText(req.body.cover_image, 1000);
  const status = req.body.status === "published" ? "published" : "draft";
  const featured = req.user.role === "admin" && req.body.featured ? 1 : 0;
  const categoryId = req.body.category_id ? Number(req.body.category_id) : null;

  if (!title || !excerpt || !content) {
    return res.status(400).json({ message: "Title, excerpt and content are required." });
  }

  const slug = createUniqueSlug(title);
  const result = db.prepare(`
    INSERT INTO posts
      (author_id, category_id, title, slug, excerpt, content, cover_image, status, featured, published_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'published' THEN CURRENT_TIMESTAMP ELSE NULL END)
  `).run(req.user.id, categoryId, title, slug, excerpt, content, coverImage, status, featured, status);

  res.status(201).json({ id: result.lastInsertRowid, slug, message: "Post created." });
});

app.get("/api/dashboard/posts/:id", authenticate, (req, res) => {
  const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(Number(req.params.id));
  if (!post) return res.status(404).json({ message: "Post not found." });
  if (req.user.role !== "admin" && post.author_id !== req.user.id) {
    return res.status(403).json({ message: "You cannot edit this post." });
  }
  res.json(post);
});

app.put("/api/dashboard/posts/:id", authenticate, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM posts WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ message: "Post not found." });
  if (req.user.role !== "admin" && existing.author_id !== req.user.id) {
    return res.status(403).json({ message: "You cannot edit this post." });
  }

  const title = cleanText(req.body.title, 180);
  const excerpt = cleanText(req.body.excerpt, 500);
  const content = cleanText(req.body.content, 50000);
  const coverImage = cleanText(req.body.cover_image, 1000);
  const status = req.body.status === "published" ? "published" : "draft";
  const featured = req.user.role === "admin" && req.body.featured ? 1 : 0;
  const categoryId = req.body.category_id ? Number(req.body.category_id) : null;

  if (!title || !excerpt || !content) {
    return res.status(400).json({ message: "Title, excerpt and content are required." });
  }

  const slug = title === existing.title ? existing.slug : createUniqueSlug(title, id);

  db.prepare(`
    UPDATE posts
    SET category_id = ?, title = ?, slug = ?, excerpt = ?, content = ?,
        cover_image = ?, status = ?, featured = ?,
        published_at = CASE
          WHEN ? = 'published' AND published_at IS NULL THEN CURRENT_TIMESTAMP
          WHEN ? = 'draft' THEN NULL
          ELSE published_at
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(categoryId, title, slug, excerpt, content, coverImage, status, featured, status, status, id);

  res.json({ slug, message: "Post updated." });
});

app.delete("/api/dashboard/posts/:id", authenticate, (req, res) => {
  const id = Number(req.params.id);
  const post = db.prepare("SELECT author_id FROM posts WHERE id = ?").get(id);
  if (!post) return res.status(404).json({ message: "Post not found." });
  if (req.user.role !== "admin" && post.author_id !== req.user.id) {
    return res.status(403).json({ message: "You cannot delete this post." });
  }
  db.prepare("DELETE FROM posts WHERE id = ?").run(id);
  res.json({ message: "Post deleted." });
});

app.get("/api/dashboard/comments", authenticate, (req, res) => {
  const comments = req.user.role === "admin"
    ? db.prepare(`
        SELECT cm.*, p.title AS post_title
        FROM comments cm JOIN posts p ON p.id = cm.post_id
        ORDER BY cm.created_at DESC
      `).all()
    : db.prepare(`
        SELECT cm.*, p.title AS post_title
        FROM comments cm JOIN posts p ON p.id = cm.post_id
        WHERE p.author_id = ?
        ORDER BY cm.created_at DESC
      `).all(req.user.id);

  res.json(comments);
});

app.patch("/api/dashboard/comments/:id", authenticate, (req, res) => {
  const id = Number(req.params.id);
  const comment = db.prepare(`
    SELECT cm.id, p.author_id FROM comments cm
    JOIN posts p ON p.id = cm.post_id
    WHERE cm.id = ?
  `).get(id);

  if (!comment) return res.status(404).json({ message: "Comment not found." });
  if (req.user.role !== "admin" && comment.author_id !== req.user.id) {
    return res.status(403).json({ message: "You cannot moderate this comment." });
  }

  db.prepare("UPDATE comments SET approved = ? WHERE id = ?").run(req.body.approved ? 1 : 0, id);
  res.json({ message: "Comment updated." });
});

app.delete("/api/dashboard/comments/:id", authenticate, (req, res) => {
  const id = Number(req.params.id);
  const comment = db.prepare(`
    SELECT cm.id, p.author_id FROM comments cm
    JOIN posts p ON p.id = cm.post_id
    WHERE cm.id = ?
  `).get(id);

  if (!comment) return res.status(404).json({ message: "Comment not found." });
  if (req.user.role !== "admin" && comment.author_id !== req.user.id) {
    return res.status(403).json({ message: "You cannot delete this comment." });
  }

  db.prepare("DELETE FROM comments WHERE id = ?").run(id);
  res.json({ message: "Comment deleted." });
});

app.get("/api/admin/users", authenticate, requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT id, name, email, role, bio, created_at,
      (SELECT COUNT(*) FROM posts WHERE author_id = users.id) AS post_count
    FROM users
    ORDER BY created_at DESC
  `).all();
  res.json(users);
});

app.use("/api", (req, res) => {
  res.status(404).json({ message: "API route not found." });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: "Unexpected server error." });
});

app.listen(PORT, () => {
  console.log(`Blog running at http://localhost:${PORT}`);
});
