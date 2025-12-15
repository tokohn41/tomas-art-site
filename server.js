const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { Pool } = require("pg");
const path = require("path");

const app = express();

/* =====================
   ENVIRONMENT
===================== */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;

/* =====================
   DATABASE (SUPABASE)
===================== */
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =====================
   CLOUDINARY
===================== */
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "tomas-art-site",
    allowed_formats: ["jpg", "jpeg", "png"]
  }
});
const upload = multer({ storage });

/* =====================
   MIDDLEWARE
===================== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

/* =====================
   ADMIN AUTH
===================== */
function requireAdmin(req, res, next) {
  const pw = req.body.password || req.headers["x-admin-password"];
  if (pw === ADMIN_PASSWORD) return next();
  res.status(401).send("Not authorized");
}

/* =====================
   ROUTES
===================== */

// Fetch gallery
app.get("/paintings", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM paintings ORDER BY date DESC"
  );
  res.json(result.rows);
});

// Upload painting (IMPORTANT: multer BEFORE auth)
app.post(
  "/paintings",
  upload.single("image"),
  requireAdmin,
  async (req, res) => {
    if (!req.file) return res.status(400).send("Image required");

    const { title, date, materials, location, description } = req.body;

    await pool.query(
      `INSERT INTO paintings
       (title, date, materials, location, description, image_url, cloudinary_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        title || "",
        date || "",
        materials || "",
        location || "",
        description || "",
        req.file.path,
        req.file.filename.split("/").pop()
      ]
    );

    res.send("OK");
  }
);

// Delete painting
app.delete("/paintings/:id", async (req, res) => {
  if (req.headers["x-admin-password"] !== ADMIN_PASSWORD) {
    return res.status(401).send("Not authorized");
  }

  const id = req.params.id;

  const result = await pool.query(
    "SELECT cloudinary_id FROM paintings WHERE id=$1",
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).send("Not found");
  }

  await cloudinary.uploader.destroy(
    `tomas-art-site/${result.rows[0].cloudinary_id}`
  );

  await pool.query("DELETE FROM paintings WHERE id=$1", [id]);

  res.send("Deleted");
});

/* =====================
   START SERVER
===================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running");
});
