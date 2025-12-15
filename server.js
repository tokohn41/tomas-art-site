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

// ===== Supabase Client =====
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

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
    const { data, error } = await supabase
      .from("paintings")
      .insert([{
        title: title || "",
        date: date || "",
        materials: materials || "",
        location: location || "",
        description: description || "",
        image_url: imageUrl,
        cloudinary_id: cloudinaryId
      }])
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get all paintings (gallery)
app.get("/paintings", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("paintings")
      .select("*")
      .order("date", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a painting
app.delete("/paintings/:id", requireAdmin, async (req, res) => {
  const id = req.params.id;

  try {
    // Get painting
    const { data, error: fetchError } = await supabase
      .from("paintings")
      .select("cloudinary_id")
      .eq("id", id)
      .single();

    if (fetchError || !data) return res.status(404).json({ error: "Painting not found" });

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(`tomas-art-site/${data.cloudinary_id}`);

    // Delete from Supabase
    const { error: deleteError } = await supabase
      .from("paintings")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===== Start Server =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
