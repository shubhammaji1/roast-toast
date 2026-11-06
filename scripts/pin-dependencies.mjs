import { readFile, writeFile } from "node:fs/promises";
const path = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(await readFile(path));
for (const section of ["dependencies", "devDependencies"]) {
  for (const name of Object.keys(pkg[section])) {
    pkg[section][name] = JSON.parse(
      await readFile(
        new URL(`../node_modules/${name}/package.json`, import.meta.url),
      ),
    ).version;
  }
}
await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`);
console.log("Pinned dependency versions to the installed, verified tree.");
