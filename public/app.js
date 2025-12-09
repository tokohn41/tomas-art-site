// app.js - gallery + admin-aware UI
let paintings = [];
let categories = [];
let activeCategory = "All";
let isAdmin = false;
let currentPainting = null;

// DOM refs
const galleryEl = document.getElementById("gallery");
const noResultsEl = document.getElementById("no-results");
const searchEl = document.getElementById("search");
const categoryButtonsEl = document.getElementById("category-buttons");
const uploadSection = document.getElementById("upload-section");
const categorySelect = document.getElementById("category-select");
const uploadMsg = document.getElementById("upload-msg");

// modal refs
const modal = document.getElementById("modal");
const modalImage = document.getElementById("modal-image");
const modalMeta = document.getElementById("modal-meta");
const modalClose = document.getElementById("modal-close");
const modalDelete = document.getElementById("modal-delete");
const adminDeleteArea = document.getElementById("admin-delete-area");

// init
async function init() {
  const s = await (await fetch("/session", { credentials: "include" })).json();
  isAdmin = !!s.isAdmin;
  await loadCategories();
  await loadPaintings();
  updateAdminUI();
}
function updateAdminUI() {
  if (isAdmin) {
    uploadSection.style.display = "block";
    adminDeleteArea.style.display = "block";
  } else {
    uploadSection.style.display = "none";
    adminDeleteArea.style.display = "none";
  }
}

// load categories
async function loadCategories() {
  const res = await fetch("/categories");
  categories = await res.json();
  renderCategoryButtons();
  populateCategorySelect();
}
function renderCategoryButtons() {
  categoryButtonsEl.innerHTML = "";
  const allBtn = makeCatButton("All");
  if (activeCategory === "All") allBtn.classList.add("active");
  categoryButtonsEl.appendChild(allBtn);
  categories.forEach(c => {
    const btn = makeCatButton(c.name);
    if (activeCategory === c.name) btn.classList.add("active");
    categoryButtonsEl.appendChild(btn);
  });
}
function makeCatButton(name) {
  const btn = document.createElement("button");
  btn.textContent = name;
  btn.className = "secondary";
  btn.onclick = () => { activeCategory = name; loadPaintings(); renderCategoryButtons(); };
  return btn;
}
function populateCategorySelect() {
  categorySelect.innerHTML = "";
  categories.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.name;
    opt.textContent = c.name;
    categorySelect.appendChild(opt);
  });
  if (!categories.some(c => c.name === "Uncategorized")) {
    const opt = document.createElement("option");
    opt.value = "Uncategorized";
    opt.textContent = "Uncategorized";
    categorySelect.appendChild(opt);
  }
}

// load paintings
async function loadPaintings() {
  const url = (activeCategory && activeCategory !== "All") ? `/paintings?category=${encodeURIComponent(activeCategory)}` : "/paintings";
  const res = await fetch(url);
  paintings = await res.json();
  renderGallery();
}
function renderGallery() {
  const q = searchEl.value.trim().toLowerCase();
  const filtered = paintings.filter(p => {
    if (q) {
      const hay = `${p.title} ${p.description} ${p.location} ${p.materials}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  galleryEl.innerHTML = "";
  if (filtered.length === 0) {
    noResultsEl.style.display = "block";
    return;
  }
  noResultsEl.style.display = "none";

  filtered.forEach(p => {
    const div = document.createElement("div");
    div.className = "card-item";
    div.innerHTML = `
      <div class="image-wrapper">
        <img src="/uploads/${p.image_filename}" alt="${escapeHtml(p.title)}">
        <div class="protect"></div>
      </div>
      <p>${escapeHtml(p.title || "")}</p>
    `;
    div.onclick = () => openModal(p);
    galleryEl.appendChild(div);
  });
}

// modal
function openModal(p) {
  currentPainting = p;
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
  modalImage.src = `/uploads/${p.image_filename}`;
  modalMeta.innerHTML = `
    <h3>${escapeHtml(p.title || "Untitled")}</h3>
    <p><strong>Date:</strong> ${escapeHtml(p.date || "")}</p>
    <p><strong>Materials:</strong> ${escapeHtml(p.materials || "")}</p>
    <p><strong>Location:</strong> ${escapeHtml(p.location || "")}</p>
    <p>${escapeHtml(p.description || "")}</p>
  `;
}
modalClose?.addEventListener("click", () => { modal.style.display = "none"; });
modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });

// delete painting (admin)
modalDelete?.addEventListener("click", async () => {
  if (!isAdmin) return alert("Admin only");
  if (!currentPainting) return;
  if (!confirm("Delete this painting?")) return;
  const res = await fetch(`/paintings/${currentPainting.id}`, { method: "DELETE", credentials: "include" });
  if (res.ok) { modal.style.display = "none"; loadPaintings(); } else {
    const j = await res.json().catch(()=>({}));
    alert("Delete failed: " + (j.error || "unknown"));
  }
});

// upload (admin)
document.getElementById("upload-btn").addEventListener("click", async () => {
  if (!isAdmin) return alert("Please log in to admin at /admin");
  const file = document.getElementById("image").files[0];
  if (!file) return alert("Please choose an image");
  const form = new FormData();
  form.append("title", document.getElementById("title").value);
  form.append("date", document.getElementById("date").value);
  form.append("materials", document.getElementById("materials").value);
  form.append("location", document.getElementById("location").value);
  form.append("description", document.getElementById("description").value);
  form.append("category", document.getElementById("category-select").value);
  form.append("image", file);

  const res = await fetch("/paintings", { method: "POST", body: form, credentials: "include" });
  const data = await res.json();
  if (data.error) {
    uploadMsg.textContent = "Upload failed: " + data.error;
  } else {
    uploadMsg.textContent = "Uploaded!";
    document.getElementById("title").value = "";
    document.getElementById("date").value = "";
    document.getElementById("materials").value = "";
    document.getElementById("location").value = "";
    document.getElementById("description").value = "";
    document.getElementById("image").value = "";
    loadCategories();
    loadPaintings();
    setTimeout(()=> uploadMsg.textContent = "", 3000);
  }
});

// search input
searchEl.addEventListener("input", renderGallery);

function escapeHtml(s) {
  if (!s) return "";
  return s.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

// start
init();
