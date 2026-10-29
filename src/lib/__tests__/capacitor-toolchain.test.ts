import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const cliRequire = createRequire(
  require.resolve("@capacitor/cli/package.json"),
);
const xcodePath = cliRequire.resolve("xcode");
const xcodeRequire = createRequire(xcodePath);
const xcode = cliRequire("xcode");

it("Capacitor's actual xcode dependency resolves the patched CommonJS uuid", () => {
  expect(xcodeRequire("uuid/package.json").version).toBe("11.1.1");
  expect(xcodeRequire("uuid").v4()).toMatch(/^[0-9a-f-]{36}$/);
});

it("xcode produces unique 24-character project IDs with the patched uuid", () => {
  const project = xcode.project("unused.pbxproj");
  project.hash = { project: { objects: { PBXGroup: {} } } };
  const ids = Array.from({ length: 128 }, () => project.generateUuid());
  expect(new Set(ids).size).toBe(128);
  for (const id of ids) expect(id).toMatch(/^[0-9A-F]{24}$/);
});

it("xcode can parse, add a generated group and write/reparse a project", () => {
  const directory = mkdtempSync(join(tmpdir(), "bhromor-xcode-"));
  const file = join(directory, "project.pbxproj");
  const root = "AAAAAAAAAAAAAAAAAAAAAAAA";
  try {
    writeFileSync(
      file,
      `// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n/* Begin PBXGroup section */\n${root} = { isa = PBXGroup; children = (); sourceTree = "<group>"; };\n/* End PBXGroup section */\n}; rootObject = ${root}; }\n`,
    );
    const project = xcode.project(file);
    project.parseSync();
    const group = project.addPbxGroup([], "Compatibility", "Compatibility");
    expect(group.uuid).toMatch(/^[0-9A-F]{24}$/);
    const written = project.writeSync();
    expect(written).toContain("Compatibility");
    writeFileSync(file, written);
    const parsed = xcode.project(file);
    parsed.parseSync();
    expect(parsed.hash.project.objects.PBXGroup[group.uuid].name).toBe(
      "Compatibility",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
