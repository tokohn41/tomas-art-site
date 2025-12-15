// server.js
const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { Pool } = require("pg");
const path = require("path");

const app = express();

// ===== Environment Variables =====
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this";

// ===== Supabase (Postgres) Connection =====
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Ensure paintings table exists
pool.query(`
  CREATE TABLE IF NOT EXISTS paintings (
    id SERIAL PRIMARY KEY,
    title TEXT,
    date TEXT,
    materials TEXT,
    location TEXT,
    description TEXT,
    image_url TEXT,
    cloudinary_id TEXT
  )
`).then(() => console.log("Supabase table 'paintings' ready"))
  .catch(err => console.error("Error creating table:", err.message));

// ===== Cloudinary Configuration =====
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
});

// ===== Multer + Cloudinary Storage =====
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "tomas-art-site",
    allowed_formats: ["jpg", "jpeg", "png"]
  }
});
const upload = multer({ storage });

// ===== Middleware =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ===== Admin Middleware =====
function requireAdmin(req, res, next) {
  const pw = req.body.password || req.headers["x-admin-password"];
  if (pw === ADMIN_PASSWORD) next();
  else res.status(401).send("Not authorized");
}

// ===== Routes =====

// Upload painting
app.post("/paintings", requireAdmin, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Image required" });

  const { title, date, materials, location, description } = req.body;
  const imageUrl = req.file.path; // Cloudinary URL
  const cloudinaryId = req.file.filename.split("/").pop();

  try {
    const result = await pool.query(
      `INSERT INTO paintings (title, date, materials, location, description, image_url, cloudinary_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [title || "", date || "", materials || "", location || "", description || "", imageUrl, cloudinaryId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get all paintings (gallery)
app.get("/paintings", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM paintings ORDER BY date DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a painting
app.delete("/paintings/:id", requireAdmin, async (req, res) => {
  const id = req.params.id;

  try {
    const result = await pool.query("SELECT cloudinary_id FROM paintings WHERE id=$1", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Painting not found" });

    const cloudId = result.rows[0].cloudinary_id;
    await cloudinary.uploader.destroy(`tomas-art-site/${cloudId}`);

    await pool.query("DELETE FROM paintings WHERE id=$1", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===== Start Server =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
