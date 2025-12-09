const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "cotopaxi";

// --- Session setup ---
app.use(session({
  secret: process.env.SESSION_SECRET || "replace_this_secret",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24*60*60*1000, sameSite: "lax", secure: process.env.NODE_ENV === "production" }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// --- Database ---
const DB_FILE = path.join(__dirname, "paintings.db");
const db = new sqlite3.Database(DB_FILE);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS paintings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    date TEXT,
    materials TEXT,
    location TEXT,
    description TEXT,
    category TEXT,
    image_filename TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  )`);
  db.run(`INSERT OR IGNORE INTO categories (id, name) VALUES (1, 'Uncategorized')`);
});

// --- Upload setup ---
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g,"_"))
});
const upload = multer({ storage });

// --- Admin middleware ---
function requireAdmin(req, res, next) {
  if (req.session?.isAdmin) return next();
  return res.status(401).json({ error: "Not authorized" });
}

// --- Routes ---
// Root and Admin pages
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

// Session
app.get("/session", (req, res) => res.json({ isAdmin: !!req.session?.isAdmin }));

// Login/logout
app.post("/login", (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }
  return res.status(401).json({ error: "Invalid password" });
});
app.post("/logout", (req, res) => {
  req.session.destroy(err => res.json({ success: true }));
});

// Categories
app.get("/categories", (req, res) => {
  db.all("SELECT * FROM categories ORDER BY name COLLATE NOCASE", [], (err, rows) => {
    if(err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
app.post("/categories", requireAdmin, (req, res) => {
  const name = req.body.name?.trim();
  if(!name) return res.status(400).json({ error: "Name required" });
  db.run("INSERT INTO categories(name) VALUES(?)", [name], function(err){
    if(err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name });
  });
});
app.put("/categories/:id", requireAdmin, (req,res)=>{
  const name = req.body.name?.trim();
  if(!name) return res.status(400).json({ error: "Name required" });
  db.run("UPDATE categories SET name=? WHERE id=?", [name, req.params.id], function(err){
    if(err) return res.status(500).json({ error: err.message });
    res.json({ success:true });
  });
});
app.delete("/categories/:id", requireAdmin, (req,res)=>{
  const id = req.params.id;
  db.get("SELECT name FROM categories WHERE id=?", [id], (err,row)=>{
    if(err) return res.status(500).json({ error: err.message });
    if(!row) return res.status(404).json({ error:"Not found" });
    const oldName = row.name;
    db.run("UPDATE paintings SET category='Uncategorized' WHERE category=?", [oldName]);
    db.run("DELETE FROM categories WHERE id=?", [id], function(err2){
      if(err2) return res.status(500).json({ error: err2.message });
      res.json({ success:true });
    });
  });
});

// Paintings
app.get("/paintings", (req,res)=>{
  const cat = req.query.category;
  const sql = cat && cat!=="All" ? "SELECT * FROM paintings WHERE category=? ORDER BY id DESC" : "SELECT * FROM paintings ORDER BY id DESC";
  const params = cat && cat!=="All" ? [cat] : [];
  db.all(sql, params, (err, rows)=>{
    if(err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
app.post("/paintings", requireAdmin, upload.single("image"), (req,res)=>{
  if(!req.file) return res.status(400).json({ error: "Image required" });
  const { title,date,materials,location,description,category } = req.body;
  const filename = req.file.filename;
  const cat = category?.trim() || "Uncategorized";
  db.run(
    `INSERT INTO paintings(title,date,materials,location,description,category,image_filename)
     VALUES(?,?,?,?,?,?,?)`,
     [title||"",date||"",materials||"",location||"",description||"",cat,filename],
     function(err){
       if(err) return res.status(500).json({ error: err.message });
       res.json({ id:this.lastID });
     }
  );
});
app.delete("/paintings/:id", requireAdmin, (req,res)=>{
  const id = req.params.id;
  db.get("SELECT image_filename FROM paintings WHERE id=?", [id], (err,row)=>{
    if(err) return res.status(500).json({ error: err.message });
    if(!row) return res.status(404).json({ error:"Not found" });
    const filepath = path.join(UPLOAD_DIR,row.image_filename);
    if(fs.existsSync(filepath)) fs.unlinkSync(filepath);
    db.run("DELETE FROM paintings WHERE id=?", [id], function(err2){
      if(err2) return res.status(500).json({ error: err2.message });
      res.json({ success:true });
    });
  });
});

// Catch-all
app.get("*", (req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
