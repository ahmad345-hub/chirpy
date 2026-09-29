import express from "express";
import { Request, Response, NextFunction } from "express";
import { config } from "./config.js";
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from "./errors.js";
const app = express();
const PORT = 8080;

app.use(middlewareLogResponses);

// API routes
app.get("/api/healthz", handlerReadiness);
app.post("/api/validate_chirp", handlerValidateChirp);

// Admin routes
app.get("/admin/metrics", handlerMetrics);
app.post("/admin/reset", handlerReset);

// Fileserver
app.use(
  "/app",
  middlewareMetricsInc,
  express.static("./src/app")
);

// Error handler must be last
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

async function handlerReadiness(
  req: Request,
  res: Response
): Promise<void> {
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send("OK");
}

function middlewareLogResponses(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.on("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      console.log(
        `[NON-OK] ${req.method} ${req.url} - Status: ${res.statusCode}`
      );
    }
  });

  next();
}

function middlewareMetricsInc(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  config.fileserverHits++;
  next();
}

function handlerMetrics(
  req: Request,
  res: Response
): void {
  res.set("Content-Type", "text/html; charset=utf-8");

  res.send(`
<html>
  <body>
    <h1>Welcome, Chirpy Admin</h1>
    <p>Chirpy has been visited ${config.fileserverHits} times!</p>
  </body>
</html>
  `);
}

function handlerReset(
  req: Request,
  res: Response
): void {
  config.fileserverHits = 0;

  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send("Hits reset to 0");
}

function handlerValidateChirp(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let body = "";

  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", () => {
    try {
      const parsedBody = JSON.parse(body);

      if (parsedBody.body.length > 140) {
  throw new BadRequestError(
    "Chirp is too long. Max length is 140"
  );
}

      const profaneWords = [
        "kerfuffle",
        "sharbert",
        "fornax",
      ];

      const words = parsedBody.body.split(" ");

      const cleanedWords = words.map((word: string) => {
        if (profaneWords.includes(word.toLowerCase())) {
          return "****";
        }

        return word;
      });

      const cleanedBody = cleanedWords.join(" ");

      res.status(200).json({
        cleanedBody: cleanedBody,
      });
    } catch (error) {
      next(error);
    }
  });
}

function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.log(err);

  if (err instanceof BadRequestError) {
    res.status(400).json({
      error: err.message,
    });
    return;
  }

  if (err instanceof UnauthorizedError) {
    res.status(401).json({
      error: err.message,
    });
    return;
  }

  if (err instanceof ForbiddenError) {
    res.status(403).json({
      error: err.message,
    });
    return;
  }

  if (err instanceof NotFoundError) {
    res.status(404).json({
      error: err.message,
    });
    return;
  }

  res.status(500).json({
    error: "Something went wrong on our end",
  });
}
