const express = require("express");
const session = require("express-session");
const multer = require("multer");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "replace_this_secret",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24*60*60*1000 }
}));

// --- Serve static files ---
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// --- Ensure uploads folder exists ---
const uploadDir = path.join(__dirname, "public/uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// --- Multer setup ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// --- Database setup ---
const db = new sqlite3.Database("./paintings.db");

// --- Create tables if not exist ---
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS paintings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    date TEXT,
    materials TEXT,
    location TEXT,
    description TEXT,
    image_filename TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  )`);

  // --- Add category column if it doesn't exist ---
  db.get("PRAGMA table_info(paintings)", (err, info) => {
    db.all("PRAGMA table_info(paintings)", (err, columns) => {
      const hasCategory = columns.some(c => c.name === "category");
      if (!hasCategory) {
        db.run("ALTER TABLE paintings ADD COLUMN category TEXT DEFAULT 'Uncategorized'");
        console.log("Added 'category' column to paintings table");
      }
    });
  });
});

// --- Middleware to check admin ---
function requireAdmin(req, res, next) {
  if (req.session?.isAdmin) return next();
  return res.status(401).json({ error: "Not authorized" });
}

// --- Routes ---

// Check session
app.get("/session", (req, res) => res.json({ isAdmin: !!req.session?.isAdmin }));

// Admin login
app.post("/login", (req, res) => {
  const password = req.body.password;
  if (password === process.env.ADMIN_PASSWORD || password === "cotopaxi") {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }
  return res.status(401).json({ error: "Invalid password" });
});

// Admin logout
app.post("/logout", (req, res) => {
  req.session.destroy(err => res.json({ success: true }));
});

// --- Paintings ---

app.get("/paintings", (req, res) => {
  db.all("SELECT * FROM paintings ORDER BY date DESC", [], (err, rows) => {
    if(err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post("/paintings", requireAdmin, upload.single("image"), (req, res) => {
  if(!req.file) return res.status(400).json({ error: "Image required" });
  const { title, date, materials, location, description, category } = req.body;
  const cat = category?.trim() || "Uncategorized";
  db.run(
    `INSERT INTO paintings(title,date,materials,location,description,category,image_filename)
     VALUES(?,?,?,?,?,?,?)`,
     [title||"", date||"", materials||"", location||"", description||"", cat, req.file.filename],
     function(err) {
       if(err) return res.status(500).json({ error: err.message });
       res.json({ id: this.lastID });
     }
  );
});

app.delete("/paintings/:id", requireAdmin, (req, res) => {
  const id = req.params.id;
  db.get("SELECT image_filename FROM paintings WHERE id=?", [id], (err, row) => {
    if(err || !row) return res.status(404).json({ error: "Not found" });
    const filePath = path.join(uploadDir, row.image_filename);
    if(fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.run("DELETE FROM paintings WHERE id=?", [id], err => {
      if(err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

// --- Categories ---

app.get("/categories", (req, res) => {
  db.all("SELECT * FROM categories ORDER BY name ASC", [], (err, rows) => {
    if(err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post("/categories", requireAdmin, (req, res) => {
  const name = req.body.name?.trim();
  if(!name) return res.status(400).json({ error: "Name required" });
  db.run("INSERT OR IGNORE INTO categories(name) VALUES(?)", [name], function(err) {
    if(err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

app.delete("/categories/:id", requireAdmin, (req, res) => {
  const id = req.params.id;
  db.get("SELECT name FROM categories WHERE id=?", [id], (err, row) => {
    if(err || !row) return res.status(404).json({ error: "Not found" });
    const catName = row.name;
    db.run("UPDATE paintings SET category='Uncategorized' WHERE category=?", [catName]);
    db.run("DELETE FROM categories WHERE id=?", [id], err => {
      if(err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

// --- Serve admin page ---
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public/admin.html")));

// --- Fallback route for gallery / SPA ---
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));

// --- Start server ---
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
