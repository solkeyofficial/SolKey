
import express from "express";
import { requireSolKey } from "./middleware/requireSolKey.js";

const app = express();
app.use(express.json());

app.post("/protected", requireSolKey("write:data"), (req, res) => {
  res.json({ ok: true, message: "Authorized via SolKey" });
});

app.listen(8788);
