import express from "express";
import { Request, Response, NextFunction } from "express";
import { config } from "./config.js";
const app = express();
app.use(middlewareLogResponses);
const PORT = 8080;

app.get("/api/healthz", handlerReadiness);
app.get("/admin/metrics", handlerMetrics);
app.post("/admin/reset", handlerReset);
app.post("/api/validate_chirp", handlerValidateChirp);
app.use(
  "/app",
  middlewareMetricsInc,
  express.static("./src/app")
);

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


function handlerMetrics(req: Request, res: Response): void {
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


function handlerReset(req: Request, res: Response): void {
  config.fileserverHits = 0;
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send("Hits reset to 0");
}


function handlerValidateChirp(req: Request, res: Response): void {
  let body = "";

  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", () => {
    try {
      const parsedBody = JSON.parse(body);

      if (parsedBody.body.length > 140) {
        res.header("Content-Type", "application/json");
        res.status(400).send(
          JSON.stringify({
            error: "Chirp is too long",
          })
        );
        return;
      }

      res.header("Content-Type", "application/json");
      res.status(200).send(
        JSON.stringify({
          valid: true,
        })
      );
    } catch (error) {
      res.header("Content-Type", "application/json");
      res.status(400).send(
        JSON.stringify({
          error: "Something went wrong",
        })
      );
    }
  });
}
