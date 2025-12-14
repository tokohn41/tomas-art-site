const express = require("express");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
const sqlite3 = require("sqlite3").verbose();
const app = express();
const path = require("path");

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- Database ---
const db = new sqlite3.Database("./paintings.db");

// --- Cloudinary configuration ---
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "tomas-art-site",
    allowed_formats: ["jpg", "jpeg", "png"]
  }
});

const upload = multer({ storage: storage });

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Admin password middleware ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this";

function requireAdmin(req, res, next) {
  const pw = req.headers["x-admin-password"] || req.body.password;
  if (pw === ADMIN_PASSWORD) next();
  else res.status(401).send("Not authorized");
}

// --- Upload painting ---
app.post("/paintings", requireAdmin, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Image required" });

  const { title, date, materials, location, description, category } = req.body;
  const cat = category?.trim() || "Uncategorized";
  const image_url = req.file.path; // Cloudinary URL

  db.run(
    `INSERT INTO paintings(title,date,materials,location,description,category,image_filename)
     VALUES(?,?,?,?,?,?,?)`,
    [title || "", date || "", materials || "", location || "", description || "", cat, image_url],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, image_url });
    }
  );
});

// --- Serve gallery ---
app.get("/paintings", (req, res) => {
  db.all("SELECT * FROM paintings ORDER BY date DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- Delete painting ---
app.delete("/paintings/:id", requireAdmin, (req, res) => {
  const id = req.params.id;
  db.get("SELECT image_filename FROM paintings WHERE id = ?", [id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: "Painting not found" });

    // Delete from Cloudinary
    const publicId = row.image_filename.split("/").pop().split(".")[0];
    cloudinary.uploader.destroy(`tomas-art-site/${publicId}`, (err, result) => {
      if (err) console.error("Cloudinary delete failed:", err);

      // Delete from database
      db.run("DELETE FROM paintings WHERE id = ?", [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
    });
  });
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
