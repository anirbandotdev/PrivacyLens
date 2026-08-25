import cors from "cors";
import express from "express";
import analyzeRouter from "./routes/analyze.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Development-only CORS configuration.
// We will restrict this before deployment.
app.use(cors());

// Allows the server to receive sanitized screenshot data.
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (request, response) => {
  response.json({
    success: true,
    service: "PrivacyLens Server",
    status: "online",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/analyze", analyzeRouter);

app.listen(PORT, () => {
  console.log(`PrivacyLens server running at http://localhost:${PORT}`);
});