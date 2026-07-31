# Insight Journal — Full-Stack Blogging Website

A complete blogging platform with:

- Responsive public website
- User registration and login
- JWT authentication
- Author and administrator roles
- Create, edit, publish and delete posts
- Draft and published states
- Categories, search and pagination
- Featured articles
- View counting
- Reader comments with moderation
- Author dashboard and statistics
- Administrator user list
- SQLite database with automatic setup
- Basic security headers and password hashing

## Technology

- Frontend: HTML5, CSS3 and vanilla JavaScript
- Backend: Node.js and Express
- Database: SQLite using `better-sqlite3`
- Authentication: JWT and bcrypt

## Run locally

1. Install Node.js 18 or newer.
2. Open a terminal in this project folder.
3. Copy `.env.example` to `.env`.
4. Change `JWT_SECRET`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
5. Run:

```bash
npm install
npm start
```

6. Open:

```text
http://localhost:3000
```

## Default administrator

When no `.env` file is supplied:

```text
Email: admin@example.com
Password: ChangeMe123!
```

Change these credentials before publishing the project online.

## Main API routes

### Authentication

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Public content

- `GET /api/categories`
- `GET /api/posts`
- `GET /api/posts/:slug`
- `POST /api/posts/:slug/comments`

### Dashboard

- `GET /api/dashboard/stats`
- `GET /api/dashboard/posts`
- `POST /api/dashboard/posts`
- `GET /api/dashboard/posts/:id`
- `PUT /api/dashboard/posts/:id`
- `DELETE /api/dashboard/posts/:id`
- `GET /api/dashboard/comments`
- `PATCH /api/dashboard/comments/:id`
- `DELETE /api/dashboard/comments/:id`

### Administrator

- `GET /api/admin/users`

## Database structure

### users

Stores account information, password hashes, roles and author biographies.

### categories

Stores blog categories and URL slugs.

### posts

Stores article content, excerpts, cover images, publication status, featured state, views and timestamps.

### comments

Stores reader comments and their moderation state.

## Production improvements

Before a large public launch, consider adding:

- Rich-text editor such as TipTap or CKEditor
- Image upload through Cloudinary, S3 or another object-storage service
- Email verification and password reset
- Rate limiting and CAPTCHA
- HTML sanitization for article content
- PostgreSQL for larger deployments
- Automated tests
- Newsletter integration
- Social sharing metadata
- Sitemap and RSS feed
- Content scheduling
- Analytics
- Backups and monitoring

## Deployment

The project can be deployed to platforms that support Node.js, such as Render, Railway, Fly.io or a VPS. SQLite is ideal for a small installation. For horizontally scaled production hosting, replace SQLite with PostgreSQL.

Set these environment variables on the hosting provider:

```text
PORT
JWT_SECRET
ADMIN_EMAIL
ADMIN_PASSWORD
```

## One-click Render deployment

This project includes a `render.yaml` file.

1. Upload the project to a GitHub repository.
2. In Render, choose **New +** → **Blueprint**.
3. Connect the repository.
4. Render will detect `render.yaml`.
5. Review the generated administrator password in the service environment variables.
6. Deploy the Blueprint.

A persistent disk is configured for the SQLite database.
