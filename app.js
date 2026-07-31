const app = document.querySelector("#app");
const modal = document.querySelector("#modal");
const modalContent = document.querySelector("#modalContent");
const authButton = document.querySelector("#authButton");
const dashboardLink = document.querySelector("#dashboardLink");
const toast = document.querySelector("#toast");

const state = {
  token: localStorage.getItem("blog_token"),
  user: JSON.parse(localStorage.getItem("blog_user") || "null"),
  categories: []
};

const api = async (url, options = {}) => {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Something went wrong.");
  return data;
};

function escapeHtml(text = "") {
  return String(text).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[ch]));
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(date));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 3200);
}

function openModal(content) {
  modalContent.innerHTML = content;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function updateAuthUI() {
  if (state.user) {
    authButton.textContent = "Sign out";
    dashboardLink.classList.remove("hidden");
  } else {
    authButton.textContent = "Sign in";
    dashboardLink.classList.add("hidden");
  }
}

function saveSession(data) {
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem("blog_token", state.token);
  localStorage.setItem("blog_user", JSON.stringify(state.user));
  updateAuthUI();
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("blog_token");
  localStorage.removeItem("blog_user");
  updateAuthUI();
  location.hash = "#/";
  showToast("You have signed out.");
}

function authModal(mode = "login") {
  openModal(`
    <div class="auth-tabs">
      <button class="auth-tab ${mode === "login" ? "active" : ""}" data-auth-tab="login">Sign in</button>
      <button class="auth-tab ${mode === "register" ? "active" : ""}" data-auth-tab="register">Create account</button>
    </div>
    <div id="authFormArea"></div>
  `);
  renderAuthForm(mode);
  document.querySelectorAll("[data-auth-tab]").forEach(btn => {
    btn.addEventListener("click", () => authModal(btn.dataset.authTab));
  });
}

function renderAuthForm(mode) {
  const area = document.querySelector("#authFormArea");
  area.innerHTML = mode === "login" ? `
    <h2>Welcome back</h2>
    <p class="form-note">Sign in to write and manage stories.</p>
    <form id="loginForm">
      <div class="form-group"><label>Email</label><input class="input" name="email" type="email" required></div>
      <div class="form-group"><label>Password</label><input class="input" name="password" type="password" required></div>
      <button class="button" type="submit">Sign in</button>
    </form>
  ` : `
    <h2>Create your writer account</h2>
    <p class="form-note">New accounts can create and manage their own posts.</p>
    <form id="registerForm">
      <div class="form-group"><label>Name</label><input class="input" name="name" required></div>
      <div class="form-group"><label>Email</label><input class="input" name="email" type="email" required></div>
      <div class="form-group"><label>Password</label><input class="input" name="password" type="password" minlength="8" required></div>
      <button class="button" type="submit">Create account</button>
    </form>
  `;

  const form = area.querySelector("form");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    try {
      const data = await api(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(body) });
      saveSession(data);
      closeModal();
      showToast(mode === "login" ? "Welcome back." : "Account created.");
      location.hash = "#/dashboard";
    } catch (error) {
      showToast(error.message);
    }
  });
}

async function loadCategories() {
  try { state.categories = await api("/api/categories"); } catch {}
}

function postCard(post) {
  return `
    <article class="post-card">
      <a class="post-image" href="#/post/${post.slug}">
        <img src="${escapeHtml(post.cover_image || "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=80")}" alt="${escapeHtml(post.title)}">
      </a>
      <div class="post-body">
        <div class="post-meta">
          <span>${escapeHtml(post.category_name || "General")}</span>
          <span>•</span>
          <span>${formatDate(post.published_at || post.created_at)}</span>
        </div>
        <h3><a href="#/post/${post.slug}">${escapeHtml(post.title)}</a></h3>
        <p>${escapeHtml(post.excerpt)}</p>
        <a class="read-more" href="#/post/${post.slug}">Read story →</a>
      </div>
    </article>
  `;
}

async function homePage() {
  app.innerHTML = `<div class="empty-state">Loading stories…</div>`;
  try {
    const [latest, featuredData] = await Promise.all([
      api("/api/posts?limit=6"),
      api("/api/posts?featured=true&limit=1")
    ]);
    const featured = featuredData.posts[0] || latest.posts[0];

    app.innerHTML = `
      <section class="hero">
        <div class="container hero-grid">
          <div>
            <div class="eyebrow">Independent ideas • Useful knowledge</div>
            <h1>Stories that help you see the world differently.</h1>
            <p>Explore thoughtful articles about technology, business, travel, health and modern life—written for people who enjoy learning.</p>
            <div class="hero-actions">
              <a class="button" href="#/explore">Explore stories</a>
              <a class="button button-outline" href="#/dashboard">Start writing</a>
            </div>
          </div>
          <div class="hero-image">
            <img src="https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=85" alt="Writer working at a desk">
            <div class="hero-badge"><strong>Fresh perspectives</strong><br><span class="form-note">New articles from independent writers.</span></div>
          </div>
        </div>
      </section>

      ${featured ? `
      <section class="section">
        <div class="container">
          <article class="feature-story">
            <img src="${escapeHtml(featured.cover_image)}" alt="${escapeHtml(featured.title)}">
            <div class="feature-content">
              <div class="eyebrow" style="color:#ffb39f">Featured story</div>
              <h2>${escapeHtml(featured.title)}</h2>
              <p>${escapeHtml(featured.excerpt)}</p>
              <div><a class="button" href="#/post/${featured.slug}">Read featured story</a></div>
            </div>
          </article>
        </div>
      </section>` : ""}

      <section class="section">
        <div class="container">
          <div class="section-head">
            <div><div class="eyebrow">Latest</div><h2>Recent stories</h2></div>
            <a class="button button-outline" href="#/explore">View all</a>
          </div>
          <div class="posts-grid">${latest.posts.map(postCard).join("") || '<div class="empty-state">No published posts yet.</div>'}</div>
        </div>
      </section>
    `;
  } catch (error) {
    app.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function explorePage(params = {}) {
  const category = params.category || "";
  const search = params.search || "";
  app.innerHTML = `
    <section class="page-heading">
      <div class="container">
        <div class="eyebrow">Discover</div>
        <h1>Explore stories</h1>
        <form id="searchForm" class="search-bar">
          <input class="input" name="search" placeholder="Search articles…" value="${escapeHtml(search)}">
          <button class="button">Search</button>
        </form>
      </div>
    </section>
    <section class="section" style="padding-top:20px">
      <div class="container">
        <div class="category-row" id="categories"></div>
        <div class="posts-grid" id="postGrid"><div class="empty-state">Loading…</div></div>
        <div class="pagination" id="pagination"></div>
      </div>
    </section>
  `;

  const categoryWrap = document.querySelector("#categories");
  categoryWrap.innerHTML = `
    <button class="chip ${!category ? "active" : ""}" data-category="">All</button>
    ${state.categories.map(c => `<button class="chip ${category === c.slug ? "active" : ""}" data-category="${c.slug}">${escapeHtml(c.name)} (${c.post_count})</button>`).join("")}
  `;
  categoryWrap.addEventListener("click", e => {
    const btn = e.target.closest("[data-category]");
    if (!btn) return;
    explorePage({ category: btn.dataset.category, search });
  });

  document.querySelector("#searchForm").addEventListener("submit", e => {
    e.preventDefault();
    explorePage({ category, search: new FormData(e.target).get("search") });
  });

  await fetchExplorePosts(1, category, search);
}

async function fetchExplorePosts(page, category, search) {
  const grid = document.querySelector("#postGrid");
  const pagination = document.querySelector("#pagination");
  try {
    const qs = new URLSearchParams({ page, limit: 9 });
    if (category) qs.set("category", category);
    if (search) qs.set("search", search);
    const data = await api(`/api/posts?${qs}`);
    grid.innerHTML = data.posts.map(postCard).join("") || `<div class="empty-state">No stories match your search.</div>`;
    pagination.innerHTML = Array.from({ length: data.pagination.pages }, (_, i) => `
      <button class="chip ${i + 1 === data.pagination.page ? "active" : ""}" data-page="${i + 1}">${i + 1}</button>
    `).join("");
    pagination.onclick = e => {
      const btn = e.target.closest("[data-page]");
      if (btn) fetchExplorePosts(Number(btn.dataset.page), category, search);
    };
  } catch (error) {
    grid.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function postPage(slug) {
  app.innerHTML = `<div class="empty-state">Loading story…</div>`;
  try {
    const post = await api(`/api/posts/${slug}`);
    app.innerHTML = `
      <article>
        <header class="article-header article-shell">
          <div class="eyebrow">${escapeHtml(post.category_name || "General")}</div>
          <h1>${escapeHtml(post.title)}</h1>
          <div class="post-meta" style="justify-content:center">
            <span>By ${escapeHtml(post.author_name)}</span><span>•</span>
            <span>${formatDate(post.published_at || post.created_at)}</span><span>•</span>
            <span>${post.views} views</span>
          </div>
        </header>
        <img class="article-cover" src="${escapeHtml(post.cover_image || "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1400&q=80")}" alt="${escapeHtml(post.title)}">
        <div class="article-shell">
          <div class="article-content">${post.content}</div>
          <div class="author-box">
            <div class="avatar">${escapeHtml(post.author_name.slice(0,1).toUpperCase())}</div>
            <div><strong>${escapeHtml(post.author_name)}</strong><p class="form-note">${escapeHtml(post.author_bio || "Writer at Insight Journal.")}</p></div>
          </div>

          <section>
            <div class="section-head"><div><h2>Comments</h2><p>${post.comments.length} approved comment(s)</p></div></div>
            <div>${post.comments.map(c => `
              <div class="comment"><strong>${escapeHtml(c.name)}</strong><div class="form-note">${formatDate(c.created_at)}</div><p>${escapeHtml(c.content)}</p></div>
            `).join("") || '<p class="form-note">Be the first to comment.</p>'}</div>

            <form id="commentForm" style="margin-top:30px">
              <h3>Leave a comment</h3>
              <div class="form-grid">
                <div class="form-group"><label>Name</label><input class="input" name="name" required></div>
                <div class="form-group"><label>Email</label><input class="input" name="email" type="email" required></div>
              </div>
              <div class="form-group"><label>Comment</label><textarea class="textarea" name="content" required></textarea></div>
              <button class="button">Submit comment</button>
              <p class="form-note">Comments are reviewed before publication.</p>
            </form>
          </section>
        </div>
      </article>
    `;
    document.querySelector("#commentForm").addEventListener("submit", async e => {
      e.preventDefault();
      try {
        const body = Object.fromEntries(new FormData(e.target));
        const result = await api(`/api/posts/${slug}/comments`, { method: "POST", body: JSON.stringify(body) });
        e.target.reset();
        showToast(result.message);
      } catch (error) { showToast(error.message); }
    });
  } catch (error) {
    app.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function aboutPage() {
  app.innerHTML = `
    <section class="page-heading"><div class="container"><div class="eyebrow">Our purpose</div><h1>About Insight Journal</h1></div></section>
    <section class="section" style="padding-top:20px">
      <div class="container about-grid">
        <img src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=85" alt="Editorial team">
        <div>
          <h2>We make useful ideas easier to understand.</h2>
          <p>Insight Journal is a modern publishing platform for independent writers and curious readers. It combines an elegant reading experience with a practical content-management dashboard.</p>
          <p>Authors can create drafts, publish stories, track views and moderate comments. Administrators can manage the entire publication.</p>
          <a class="button" href="#/explore">Read our stories</a>
        </div>
      </div>
    </section>
  `;
}

async function dashboardPage(tab = "overview") {
  if (!state.user) {
    authModal("login");
    location.hash = "#/";
    return;
  }

  app.innerHTML = `
    <section class="dashboard">
      <div class="container">
        <div class="section-head">
          <div><div class="eyebrow">Writer workspace</div><h2>Hello, ${escapeHtml(state.user.name)}</h2></div>
          <button class="button" id="newPostButton">+ New post</button>
        </div>
        <div class="dashboard-layout">
          <aside class="dashboard-nav">
            <button data-tab="overview" class="${tab === "overview" ? "active" : ""}">Overview</button>
            <button data-tab="posts" class="${tab === "posts" ? "active" : ""}">Posts</button>
            <button data-tab="comments" class="${tab === "comments" ? "active" : ""}">Comments</button>
            ${state.user.role === "admin" ? `<button data-tab="users" class="${tab === "users" ? "active" : ""}">Users</button>` : ""}
          </aside>
          <div id="dashboardContent"></div>
        </div>
      </div>
    </section>
  `;

  document.querySelector(".dashboard-nav").addEventListener("click", e => {
    const btn = e.target.closest("[data-tab]");
    if (btn) dashboardPage(btn.dataset.tab);
  });
  document.querySelector("#newPostButton").addEventListener("click", () => postEditor());

  if (tab === "overview") renderOverview();
  if (tab === "posts") renderDashboardPosts();
  if (tab === "comments") renderComments();
  if (tab === "users") renderUsers();
}

async function renderOverview() {
  const target = document.querySelector("#dashboardContent");
  try {
    const stats = await api("/api/dashboard/stats");
    target.innerHTML = `
      <h3>Publication overview</h3>
      <div class="stats-grid">
        <div class="stat-card"><div class="form-note">Total posts</div><div class="stat-number">${stats.total_posts || 0}</div></div>
        <div class="stat-card"><div class="form-note">Published</div><div class="stat-number">${stats.published_posts || 0}</div></div>
        <div class="stat-card"><div class="form-note">Total views</div><div class="stat-number">${stats.total_views || 0}</div></div>
        <div class="stat-card"><div class="form-note">Pending comments</div><div class="stat-number">${stats.pending_comments || 0}</div></div>
      </div>
      <div class="stat-card">
        <h3>What you can do here</h3>
        <p>Create drafts, publish articles, update existing stories and moderate reader comments. Administrators can also feature posts and review all user accounts.</p>
      </div>
    `;
  } catch (error) { target.innerHTML = escapeHtml(error.message); }
}

async function renderDashboardPosts() {
  const target = document.querySelector("#dashboardContent");
  target.innerHTML = `<div class="empty-state">Loading posts…</div>`;
  try {
    const posts = await api("/api/dashboard/posts");
    target.innerHTML = `
      <div class="section-head"><div><h3>All posts</h3><p>${posts.length} total</p></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Title</th><th>Status</th><th>Author</th><th>Views</th><th>Actions</th></tr></thead>
        <tbody>${posts.map(p => `
          <tr>
            <td><strong>${escapeHtml(p.title)}</strong><br><small>${escapeHtml(p.category_name || "General")}</small></td>
            <td><span class="status ${p.status}">${p.status}</span></td>
            <td>${escapeHtml(p.author_name)}</td>
            <td>${p.views}</td>
            <td><div class="action-row">
              <button class="icon-button" data-edit="${p.id}">Edit</button>
              ${p.status === "published" ? `<a class="icon-button" href="#/post/${p.slug}">View</a>` : ""}
              <button class="icon-button" data-delete="${p.id}">Delete</button>
            </div></td>
          </tr>`).join("") || '<tr><td colspan="5">No posts yet.</td></tr>'}
        </tbody>
      </table></div>
    `;
    target.onclick = async e => {
      const edit = e.target.closest("[data-edit]");
      const del = e.target.closest("[data-delete]");
      if (edit) postEditor(Number(edit.dataset.edit));
      if (del && confirm("Delete this post permanently?")) {
        try {
          await api(`/api/dashboard/posts/${del.dataset.delete}`, { method: "DELETE" });
          showToast("Post deleted.");
          renderDashboardPosts();
        } catch (error) { showToast(error.message); }
      }
    };
  } catch (error) { target.innerHTML = escapeHtml(error.message); }
}

async function postEditor(id = null) {
  let post = {
    title: "", excerpt: "", content: "<p>Start writing your story here...</p>",
    cover_image: "", status: "draft", featured: 0, category_id: ""
  };
  if (id) {
    try { post = await api(`/api/dashboard/posts/${id}`); }
    catch (error) { return showToast(error.message); }
  }

  openModal(`
    <h2>${id ? "Edit post" : "Create a new post"}</h2>
    <form id="postForm">
      <div class="form-group"><label>Title</label><input class="input" name="title" value="${escapeHtml(post.title)}" required></div>
      <div class="form-group"><label>Excerpt</label><textarea class="textarea" name="excerpt" style="min-height:90px" required>${escapeHtml(post.excerpt)}</textarea></div>
      <div class="form-group"><label>Cover image URL</label><input class="input" name="cover_image" value="${escapeHtml(post.cover_image || "")}" placeholder="https://..."></div>
      <div class="form-grid">
        <div class="form-group"><label>Category</label><select class="select" name="category_id">
          <option value="">General</option>
          ${state.categories.map(c => `<option value="${c.id}" ${Number(post.category_id) === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
        </select></div>
        <div class="form-group"><label>Status</label><select class="select" name="status">
          <option value="draft" ${post.status === "draft" ? "selected" : ""}>Draft</option>
          <option value="published" ${post.status === "published" ? "selected" : ""}>Published</option>
        </select></div>
      </div>
      ${state.user.role === "admin" ? `<label style="display:flex;gap:8px;align-items:center;margin-bottom:16px"><input type="checkbox" name="featured" ${post.featured ? "checked" : ""}> Feature this post</label>` : ""}
      <div class="form-group"><label>Article HTML</label><textarea class="textarea" name="content" style="min-height:280px" required>${escapeHtml(post.content)}</textarea><p class="form-note">Use basic HTML such as &lt;h2&gt;, &lt;p&gt;, &lt;strong&gt;, &lt;blockquote&gt; and lists.</p></div>
      <button class="button" type="submit">${id ? "Save changes" : "Create post"}</button>
    </form>
  `);

  document.querySelector("#postForm").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd);
    body.featured = fd.get("featured") === "on";
    try {
      const result = await api(id ? `/api/dashboard/posts/${id}` : "/api/dashboard/posts", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(body)
      });
      closeModal();
      showToast(result.message);
      dashboardPage("posts");
    } catch (error) { showToast(error.message); }
  });
}

async function renderComments() {
  const target = document.querySelector("#dashboardContent");
  try {
    const comments = await api("/api/dashboard/comments");
    target.innerHTML = `
      <div class="section-head"><div><h3>Comments</h3><p>Approve or remove reader responses.</p></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Reader</th><th>Comment</th><th>Post</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${comments.map(c => `
          <tr>
            <td><strong>${escapeHtml(c.name)}</strong><br><small>${escapeHtml(c.email)}</small></td>
            <td>${escapeHtml(c.content)}</td>
            <td>${escapeHtml(c.post_title)}</td>
            <td><span class="status ${c.approved ? "approved" : "pending"}">${c.approved ? "approved" : "pending"}</span></td>
            <td><div class="action-row">
              <button class="icon-button" data-approve="${c.id}" data-value="${c.approved ? 0 : 1}">${c.approved ? "Unapprove" : "Approve"}</button>
              <button class="icon-button" data-delete-comment="${c.id}">Delete</button>
            </div></td>
          </tr>`).join("") || '<tr><td colspan="5">No comments yet.</td></tr>'}
        </tbody>
      </table></div>
    `;
    target.onclick = async e => {
      const approve = e.target.closest("[data-approve]");
      const del = e.target.closest("[data-delete-comment]");
      try {
        if (approve) {
          await api(`/api/dashboard/comments/${approve.dataset.approve}`, {
            method: "PATCH", body: JSON.stringify({ approved: Number(approve.dataset.value) })
          });
          showToast("Comment updated.");
          renderComments();
        }
        if (del && confirm("Delete this comment?")) {
          await api(`/api/dashboard/comments/${del.dataset.deleteComment}`, { method: "DELETE" });
          showToast("Comment deleted.");
          renderComments();
        }
      } catch (error) { showToast(error.message); }
    };
  } catch (error) { target.innerHTML = escapeHtml(error.message); }
}

async function renderUsers() {
  const target = document.querySelector("#dashboardContent");
  try {
    const users = await api("/api/admin/users");
    target.innerHTML = `
      <div class="section-head"><div><h3>Users</h3><p>Registered writers and administrators.</p></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Posts</th><th>Joined</th></tr></thead>
        <tbody>${users.map(u => `
          <tr><td><strong>${escapeHtml(u.name)}</strong></td><td>${escapeHtml(u.email)}</td><td>${u.role}</td><td>${u.post_count}</td><td>${formatDate(u.created_at)}</td></tr>
        `).join("")}</tbody>
      </table></div>
    `;
  } catch (error) { target.innerHTML = escapeHtml(error.message); }
}

async function router() {
  window.scrollTo(0, 0);
  const route = location.hash.slice(1) || "/";
  const parts = route.split("/").filter(Boolean);

  if (parts[0] === "post" && parts[1]) return postPage(parts[1]);
  if (parts[0] === "explore") return explorePage();
  if (parts[0] === "about") return aboutPage();
  if (parts[0] === "dashboard") return dashboardPage(parts[1] || "overview");
  return homePage();
}

document.querySelector("#closeModal").addEventListener("click", closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
authButton.addEventListener("click", () => state.user ? logout() : authModal("login"));
document.querySelector("#menuButton").addEventListener("click", () => document.querySelector("#mainNav").classList.toggle("open"));
document.querySelector("#mainNav").addEventListener("click", () => document.querySelector("#mainNav").classList.remove("open"));
document.querySelector("#newsletterForm").addEventListener("submit", e => {
  e.preventDefault(); e.target.reset(); showToast("Thanks for joining the newsletter.");
});

window.addEventListener("hashchange", router);
document.querySelector("#year").textContent = new Date().getFullYear();

(async function init() {
  updateAuthUI();
  await loadCategories();
  router();
})();
