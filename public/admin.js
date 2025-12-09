const loginDiv = document.getElementById("loginDiv");
const adminDiv = document.getElementById("adminDiv");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginMsg = document.getElementById("loginMsg");

const uploadForm = document.getElementById("uploadForm");
const paintingsList = document.getElementById("paintingsList");
const categorySelect = document.getElementById("categorySelect");
const categoriesList = document.getElementById("categoriesList");
const newCategory = document.getElementById("newCategory");
const addCategoryBtn = document.getElementById("addCategoryBtn");

// --- Check session on load ---
fetch("/session").then(res => res.json()).then(data => {
  if(data.isAdmin) showAdmin();
});

// --- Login ---
loginBtn.addEventListener("click", async () => {
  const password = document.getElementById("password").value;
  const res = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  if(res.ok) showAdmin();
  else loginMsg.textContent = "Invalid password";
});

// --- Logout ---
logoutBtn.addEventListener("click", async () => {
  await fetch("/logout", { method: "POST" });
  adminDiv.style.display = "none";
  loginDiv.style.display = "block";
});

// --- Show admin panel ---
function showAdmin() {
  loginDiv.style.display = "none";
  adminDiv.style.display = "block";
  loadPaintings();
  loadCategories();
}

// --- Upload painting ---
uploadForm.addEventListener("submit", async e => {
  e.preventDefault();
  const formData = new FormData(uploadForm);
  const res = await fetch("/paintings", { method:"POST", body: formData });
  const data = await res.json();
  if(res.ok) {
    alert("Painting uploaded!");
    uploadForm.reset();
    loadPaintings();
  } else alert(data.error || "Upload failed");
});

// --- Load paintings ---
async function loadPaintings() {
  paintingsList.innerHTML = "";
  const res = await fetch("/paintings");
  const paintings = await res.json();
  paintings.forEach(p => {
    const div = document.createElement("div");
    div.innerHTML = `
      <b>${p.title}</b> (${p.date}) - ${p.category} <br>
      <img src="uploads/${p.image_filename}" style="max-width:150px"><br>
      <button onclick="deletePainting(${p.id})">Delete</button>
      <hr>
    `;
    paintingsList.appendChild(div);
  });
}

// --- Delete painting ---
async function deletePainting(id) {
  if(!confirm("Delete this painting?")) return;
  const res = await fetch(`/paintings/${id}`, { method: "DELETE" });
  if(res.ok) loadPaintings();
  else alert("Delete failed");
}

// --- Load categories ---
async function loadCategories() {
  categorySelect.innerHTML = "";
  categoriesList.innerHTML = "";
  const res = await fetch("/categories");
  const cats = await res.json();
  cats.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.name;
    opt.textContent = c.name;
    categorySelect.appendChild(opt);

    const div = document.createElement("div");
    div.innerHTML = `${c.name} <button onclick="deleteCategory(${c.id})">Delete</button>`;
    categoriesList.appendChild(div);
  });
}

// --- Add category ---
addCategoryBtn.addEventListener("click", async () => {
  const name = newCategory.value.trim();
  if(!name) return;
  const res = await fetch("/categories", {
    method:"POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  if(res.ok) {
    newCategory.value = "";
    loadCategories();
  } else alert("Failed to add category");
});

// --- Delete category ---
async function deleteCategory(id) {
  if(!confirm("Delete this category? All paintings will move to Uncategorized.")) return;
  const res = await fetch(`/categories/${id}`, { method:"DELETE" });
  if(res.ok) loadCategories();
  else alert("Failed to delete category");
}
