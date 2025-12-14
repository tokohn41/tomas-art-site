// server.js
const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const db = new sqlite3.Database("paintings.db");

// --- Environment ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this";

// --- Cloudinary ---
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
});

// --- Multer Cloudinary storage ---
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "tomas-art-site",
    allowed_formats: ["jpg", "jpeg", "png"]
  }
});
const upload = multer({ storage });

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// --- Serve pages ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/admin.html", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

// --- Upload painting ---
app.post("/paintings", upload.single("image"), (req, res, next) => {
  const pw = req.body.password || req.headers["x-admin-password"];
  if (pw === ADMIN_PASSWORD) return next();
  else return res.status(401).send("Not authorized");
}, (req, res) => {
  if (!req.file) return res.status(400).send("No file uploaded");

  const { title, date, materials, location, description } = req.body;
  const image_url = req.file.path;
  const public_id = req.file.filename;

  db.run(
    `INSERT INTO paintings(title,date,materials,location,description,image_filename,cloudinary_id)
     VALUES(?,?,?,?,?,?,?)`,
    [title || "", date || "", materials || "", location || "", description || "", image_url, public_id],
    function(err) {
      if (err) return res.status(500).send(err.message);
      res.send("OK");
    }
  );
});

// --- Get all paintings ---
app.get("/paintings", (req, res) => {
  db.all("SELECT * FROM paintings ORDER BY date DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- Delete painting ---
app.delete("/paintings/:id", upload.none(), (req, res, next) => {
  const pw = req.headers["x-admin-password"] || req.body.password;
  if (pw === ADMIN_PASSWORD) return next();
  else return res.status(401).send("Not authorized");
}, (req, res) => {
  const id = req.params.id;
  db.get("SELECT cloudinary_id FROM paintings WHERE id = ?", [id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: "Painting not found" });

    cloudinary.uploader.destroy(`tomas-art-site/${row.cloudinary_id}`, (err) => {
      if (err) console.error("Cloudinary delete failed:", err);

      db.run("DELETE FROM paintings WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
    });
  });
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
