import express from "express";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Lazy initialize Supabase to prevent crash if env vars are missing
let supabaseClient: any = null;
function getSupabase() {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.warn("Supabase environment variables are missing. Some features will not work.");
      return null;
    }
    try {
      supabaseClient = createClient(url, key);
    } catch (err) {
      console.error("Failed to initialize Supabase client:", err);
      return null;
    }
  }
  return supabaseClient;
}

app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", env: { 
    supabaseUrl: !!process.env.SUPABASE_URL,
    supabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY 
  }});
});

// API route to get an unused code and mark it as used
app.post("/api/get-access-code", async (req, res) => {
  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ success: false, message: "Supabase not configured" });
  }

  try {
    // 1. Pick an unused code
    let { data, error } = await supabase
      .from("access_codes")
      .select("*")
      .eq("is_used", false)
      .limit(1)
      .single();

    // 2. If no codes left, reset the cycle
    if (error || !data) {
      console.log("All codes used or error fetching. Attempting reset...");
      const { error: resetError } = await supabase
        .from("access_codes")
        .update({ is_used: false })
        .neq("id", 0);

      if (resetError) {
        return res.status(500).json({ success: false, message: "Failed to reset codes cycle" });
      }

      const { data: newData, error: newError } = await supabase
        .from("access_codes")
        .select("*")
        .eq("is_used", false)
        .limit(1)
        .single();
      
      if (newError || !newData) {
        return res.status(404).json({ success: false, message: "No codes available after reset" });
      }
      data = newData;
    }

    // 3. Mark it as used
    const { error: updateError } = await supabase
      .from("access_codes")
      .update({ is_used: true })
      .eq("id", data.id);

    if (updateError) {
      return res.status(500).json({ success: false, message: "Failed to update code status" });
    }

    return res.json({ success: true, code: data.code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/verify-code", async (req, res) => {
  const { code } = req.body;
  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ success: false, message: "Supabase not configured" });
  }
  
  try {
    const { data, error } = await supabase
      .from("access_codes")
      .select("*")
      .eq("code", code)
      .eq("is_used", false)
      .single();

    if (error || !data) {
      return res.json({ success: false, message: "Invalid or already used code" });
    }

    await supabase
      .from("access_codes")
      .update({ is_used: true })
      .eq("id", data.id);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.post("/api/seed-codes", async (req, res) => {
  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ success: false, message: "Supabase not configured" });
  }

  const ACCESS_CODES = [
    "1024", "1056", "1089", "1123", "1157", "1191", "1225", "1259", "1293", "1327",
    "1361", "1395", "1429", "1463", "1497", "1531", "1565", "1599", "1633", "1667",
    "1701", "1735", "1769", "1803", "1837", "1871", "1905", "1939", "1973", "2007",
    "2041", "2075", "2109", "2143", "2177", "2211", "2245", "2279", "2313", "2347",
    "2381", "2415", "2449", "2483", "2517", "2551", "2585", "2619", "2653", "2687",
    "2721", "2755", "2789", "2823", "2857", "2891", "2925", "2959", "2993", "3027",
    "3061", "3095", "3129", "3163", "3197", "3231", "3265", "3299", "3333", "3367",
    "3401", "3435", "3469", "3503", "3537", "3571", "3605", "3639", "3673", "3707",
    "3741", "3775", "3809", "3843", "3877", "3911", "3945", "3979", "4013", "4047",
    "4081", "4115", "4149", "4183", "4217", "4251", "4285", "4319", "4353", "4387",
    "4421", "4455", "4489", "4523", "4557", "4591", "4625", "4659", "4693", "4727",
    "4761", "4795", "4829", "4863", "4897", "4931", "4965", "4999", "5033", "5067",
    "5101", "5135", "5169", "5203", "5237", "5271", "5305", "5339", "5373", "5407",
    "5441", "5475", "5509", "5543", "5577", "5611", "5645", "5679", "5713", "5747",
    "5781", "5815", "5849", "5883", "5917", "5951", "5985", "6019", "6053", "6087",
    "6121", "6155", "6189", "6223", "6257", "6291", "6325", "6359", "6393", "6427",
    "6461", "6495", "6529", "6563", "6597", "6631", "6665", "6699", "6733", "6767",
    "6801", "6835", "6869", "6903", "6937", "6971", "7005", "7039", "7073", "7107",
    "7141", "7175", "7209", "7243", "7277", "7311", "7345", "7379", "7413", "7447",
    "7481", "7515", "7549", "7583", "7617", "7651", "7685", "7719", "7753", "7787",
    "7821", "7855", "7889", "7923", "7957", "7991", "8025", "8059", "8093", "8127",
    "8161", "8195", "8229", "8263", "8297", "8331", "8365", "8399", "8433", "8467",
    "8501", "8535", "8569", "8603", "8637", "8671", "8705", "8739", "8773", "8807",
    "8841", "8875", "8909", "8943", "8977", "9011", "9045", "9079", "9113", "9147",
    "9181", "9215", "9249", "9283", "9317", "9351", "9385", "9419", "9453", "9487",
    "9521", "9555", "9589", "9623", "9657", "9691", "9725", "9759", "9793", "9827",
    "9861", "9895", "9929", "9963", "9997", "1001", "1035", "1069", "1103", "1137",
    "1171", "1205", "1239", "1273", "1307", "1341", "1375", "1409", "1443", "1477",
    "1511", "1545", "1579", "1613", "1647", "1681", "1715", "1749", "1783", "1817",
    "1851", "1885", "1919", "1953", "1987", "2021", "2055", "2089", "2123", "2157"
  ];

  try {
    const codesToInsert = ACCESS_CODES.map(code => ({ code, is_used: false }));
    const { error } = await supabase.from("access_codes").insert(codesToInsert);
    if (error) throw error;
    res.json({ success: true, message: "Codes seeded successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to seed codes" });
  }
});

async function startServer() {
  console.log("Starting server...");
  if (process.env.NODE_ENV !== "production") {
    console.log("Initializing Vite in development mode...");
    // Dynamic import to avoid crash on Vercel where vite is not in dependencies
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    // Fallback for SPA routing in dev
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api')) return next();
      
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    console.log("Starting in production mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Only listen if not running as a serverless function (Vercel)
  if (process.env.VERCEL !== "1") {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});

export default app;

