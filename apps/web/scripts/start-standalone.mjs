import { cpSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptsDir, "..");
const repositoryDir = path.resolve(webDir, "../..");
const standaloneDir = path.join(webDir, ".next", "standalone");
const standaloneWebDir = path.join(standaloneDir, "apps", "web");

cpSync(
  path.join(webDir, ".next", "static"),
  path.join(standaloneWebDir, ".next", "static"),
  {
    recursive: true,
    force: true,
  },
);
cpSync(path.join(webDir, "public"), path.join(standaloneWebDir, "public"), {
  recursive: true,
  force: true,
});
cpSync(
  path.join(repositoryDir, "content"),
  path.join(standaloneDir, "content"),
  {
    recursive: true,
    force: true,
  },
);

process.chdir(standaloneWebDir);
await import(pathToFileURL(path.join(standaloneWebDir, "server.js")).href);
