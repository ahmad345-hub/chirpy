import express from "express";
import { Request, Response, NextFunction } from "express";

const app = express();
app.use(middlewareLogResponses);
const PORT = 8080;

app.get("/healthz", handlerReadiness);

app.use("/app", express.static("./src/app"));

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
