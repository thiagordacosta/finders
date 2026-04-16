const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const FINDERS_FILE = path.join(DATA_DIR, "finders.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf"
};

ensureStorage();

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);

    if (requestUrl.pathname === "/api/finders") {
      await handleFinders(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/upload-pdf" && request.method === "POST") {
      await handlePdfUpload(request, response);
      return;
    }

    await serveStatic(requestUrl.pathname, response);
  } catch (error) {
    sendJson(response, 500, { error: "Erro interno no servidor." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Servidor em http://${HOST}:${PORT}`);
});

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  if (!fs.existsSync(FINDERS_FILE)) {
    fs.writeFileSync(FINDERS_FILE, "[]\n", "utf8");
  }
}

async function handleFinders(request, response) {
  if (request.method === "GET") {
    sendJson(response, 200, readFinders());
    return;
  }

  if (request.method === "PUT") {
    const payload = await readJsonBody(request);
    if (!Array.isArray(payload)) {
      sendJson(response, 400, { error: "Payload invalido." });
      return;
    }

    writeFinders(payload);
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 405, { error: "Metodo nao permitido." });
}

async function handlePdfUpload(request, response) {
  const payload = await readJsonBody(request);

  if (
    !payload ||
    typeof payload.fileName !== "string" ||
    typeof payload.dataUrl !== "string" ||
    !payload.dataUrl.startsWith("data:application/pdf;base64,")
  ) {
    sendJson(response, 400, { error: "Arquivo PDF invalido." });
    return;
  }

  const safeFileName = sanitizeFileName(payload.fileName);
  const fileName = `${Date.now()}-${safeFileName}`;
  const filePath = path.join(UPLOADS_DIR, fileName);
  const base64 = payload.dataUrl.split(",")[1] ?? "";

  fs.writeFileSync(filePath, Buffer.from(base64, "base64"));

  sendJson(response, 200, {
    ok: true,
    fileName: payload.fileName,
    pdfUrl: `/uploads/${fileName}`
  });
}

async function serveStatic(urlPath, response) {
  const normalizedPath = urlPath === "/" ? "/index.html" : urlPath;
  const targetPath = path.join(ROOT, normalizedPath);

  if (!targetPath.startsWith(ROOT)) {
    sendPlain(response, 403, "Acesso negado.");
    return;
  }

  if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
    sendPlain(response, 404, "Arquivo nao encontrado.");
    return;
  }

  const extension = path.extname(targetPath);
  const contentType = MIME_TYPES[extension] || "application/octet-stream";

  response.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(targetPath).pipe(response);
}

function readFinders() {
  const raw = fs.readFileSync(FINDERS_FILE, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function writeFinders(finders) {
  fs.writeFileSync(FINDERS_FILE, `${JSON.stringify(finders, null, 2)}\n`, "utf8");
}

function sanitizeFileName(fileName) {
  const extension = path.extname(fileName).toLowerCase() === ".pdf" ? ".pdf" : ".pdf";
  const baseName = path
    .basename(fileName, path.extname(fileName))
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${baseName || "arquivo"}${extension}`;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        reject(new Error("Payload muito grande."));
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : null);
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendPlain(response, statusCode, text) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(text);
}
