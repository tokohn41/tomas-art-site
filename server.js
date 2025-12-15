// server.js
import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import dotenv from "dotenv";

dotenv.config();
const app = express();

// ===== Environment Variables =====
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this";
const NODE_ENV = process.env.NODE_ENV || "development";
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this";

// ===== Supabase Client (using DATABASE_URL if you must) =====
// Recommended: create SUPABASE_URL and SUPABASE_KEY instead of using DATABASE_URL.
// Example:
// const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// If you only have DATABASE_URL, you can use pg (but will require SSL):
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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
app.use(express.static(path.join(path.resolve(), "public")));

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

// Get all paintings
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
