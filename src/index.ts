import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { errorHandler } from "./middlewares/errorHandler";
import extractionRoutes from "./routes/extractionRoutes";
import { logger } from "./utils/logger";

const app = express();
const port = process.env.PORT || 3000;

app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });
  next();
});

app.use("/api", extractionRoutes);

// Add a catch-all route for undefined routes
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Not Found",
    message: "The requested resource was not found",
    timestamp: new Date().toISOString(),
  });
});

app.use(errorHandler);

// Only start the server if not in Vercel environment
if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  app.listen(port, () => {
    logger.info(`Excel extraction service running on port ${port}`);
  });
}

export default app;
