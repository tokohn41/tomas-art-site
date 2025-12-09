// admin.js - login / logout / categories / painting manager
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const loginMsg = document.getElementById("login-msg");
const loginPassword = document.getElementById("login-password");

const newCatInput = document.getElementById("new-cat");
const addCatBtn = document.getElementById("add-cat-btn");
const catsList = document.getElementById("cats-list");

const adminPaintingsList = document.getElementById("admin-paintings-list");

async function checkSession() {
  const s = await (await fetch("/session", { credentials: "include" })).json();
  return s.isAdmin;
}

async function refreshCats() {
  const res = await fetch("/categories");
  const cats = await res.json();
  catsList.innerHTML = "";
  cats.forEach(c => {
    const li = document.createElement("li");
    li.style.marginBottom = "8px";
    li.innerHTML = `
      <span style="display:inline-block; width:200px;">${c.name}</span>
      <button data-id="${c.id}" class="rename">Rename</button>
      <button data-id="${c.id}" class="delete">Delete</button>
    `;
    catsList.appendChild(li);
  });

  document.querySelectorAll(".rename").forEach(b => b.onclick = async (e) => {
    const id = e.target.dataset.id;
    const newName = prompt("New name:");
    if (!newName) return;
    const res = await fetch(`/categories/${id}`, {
      method: "PUT",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ name: newName }),
      credentials: "include"
    });
    if (res.ok) refreshCats(); else alert("Rename failed");
  });

  document.querySelectorAll(".delete").forEach(b => b.onclick = async (e) => {
    const id = e.target.dataset.id;
    if (!confirm("Delete this category? Paintings will be moved to 'Uncategorized'")) return;
    const res = await fetch(`/categories/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) refreshCats(); else alert("Delete failed");
  });
}

async function refreshPaintings() {
  const res = await fetch("/paintings");
  const paints = await res.json();
  adminPaintingsList.innerHTML = "";
  paints.forEach(p => {
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "12px";
    div.innerHTML = `
      <img src="/uploads/${p.image_filename}" style="width:80px;height:60px;object-fit:cover;border-radius:6px;">
      <div style="flex:1;">
        <div style="font-weight:600;">${p.title || "Untitled"}</div>
        <div style="font-size:12px;color:#666;">${p.category || ""}</div>
      </div>
      <button data-id="${p.id}" class="edit">Edit</button>
      <button data-id="${p.id}" class="del danger">Delete</button>
    `;
    adminPaintingsList.appendChild(div);
  });

  document.querySelectorAll(".del").forEach(b => b.onclick = async (e) => {
    const id = e.target.dataset.id;
    if (!confirm("Delete this painting?")) return;
    const res = await fetch(`/paintings/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) refreshPaintings(); else alert("Delete failed");
  });

  document.querySelectorAll(".edit").forEach(b => b.onclick = async (e) => {
    const id = e.target.dataset.id;
    // fetch painting details
    const res = await fetch("/paintings");
    const list = await res.json();
    const p = list.find(x => x.id == id);
    if (!p) return alert("Not found");
    const title = prompt("Title:", p.title || "");
    if (title === null) return;
    const date = prompt("Date (MM/DD/YYYY):", p.date || "");
    if (date === null) return;
    const materials = prompt("Materials:", p.materials || "");
    if (materials === null) return;
    const location = prompt("Location:", p.location || "");
    if (location === null) return;
    const description = prompt("Description:", p.description || "");
    if (description === null) return;
    const category = prompt("Category:", p.category || "Uncategorized");
    if (category === null) return;

    const upd = await fetch(`/paintings/${id}`, {
      method: "PUT",
      headers: {"Content-Type":"application/json"},
      credentials: "include",
      body: JSON.stringify({ title, date, materials, location, description, category })
    });
    if (upd.ok) refreshPaintings(); else alert("Update failed");
  });
}

// login/logout
loginBtn.onclick = async () => {
  const pw = loginPassword.value;
  const res = await fetch("/login", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    credentials: "include",
    body: JSON.stringify({ password: pw })
  });
  if (res.ok) {
    loginMsg.textContent = "Logged in";
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
    refreshCats();
    refreshPaintings();
  } else {
    loginMsg.textContent = "Wrong password";
  }
};

logoutBtn.onclick = async () => {
  await fetch("/logout", { method: "POST", credentials: "include" });
  loginMsg.textContent = "Logged out";
  loginBtn.style.display = "inline-block";
  logoutBtn.style.display = "none";
};

// add category
addCatBtn.onclick = async () => {
  const name = newCatInput.value.trim();
  if (!name) return alert("Type a category name");
  const res = await fetch("/categories", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    credentials: "include",
    body: JSON.stringify({ name })
  });
  if (res.ok) {
    newCatInput.value = "";
    refreshCats();
  } else {
    const j = await res.json().catch(()=>({}));
    alert("Failed: " + (j.error || "unknown"));
  }
};

// initial
(async () => {
  const admin = await checkSession();
  if (!admin) {
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
  } else {
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
    refreshCats();
    refreshPaintings();
  }
})();
