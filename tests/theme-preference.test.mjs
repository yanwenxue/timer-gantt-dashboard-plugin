import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: [new URL("../src/theme-preference.ts", import.meta.url).pathname],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false
});
const { loadThemePreference, selectThemeColor, applyDashboardTheme } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

function memoryStorage(initial = null) {
  let value = initial;
  return () => ({ getItem: () => value, setItem: (_key, next) => { value = next; } });
}

test("saved local color survives a reload followed by legacy or saved dashboard config", () => {
  const storage = memoryStorage();
  assert.equal(selectThemeColor("#9061d4", storage).persistence, "saved");
  for (const remote of [undefined, "#58b7a4", "#4285e6"]) {
    const reloaded = applyDashboardTheme(loadThemePreference(storage), remote);
    assert.equal(reloaded.color, "#9061d4");
    assert.equal(reloaded.persistence, "saved");
    assert.equal(storage().getItem(), "#9061d4");
  }
});

test("dashboard theme is used when no personal choice exists, without persisting it as a choice", () => {
  const storage = memoryStorage();
  const initial = loadThemePreference(storage);
  assert.equal(initial.persistence, "none");
  assert.equal(applyDashboardTheme(initial, "#4285e6").color, "#4285e6");
  assert.equal(storage().getItem(), null);
  assert.deepEqual(applyDashboardTheme(initial, undefined), initial);
});

test("late dashboard config does not overwrite a choice made during loading", () => {
  const selected = selectThemeColor("#d95c93", memoryStorage());
  assert.deepEqual(applyDashboardTheme(selected, "#4285e6"), selected);
});

test("blocked storage preserves this visit's choice and reports that persistence is unavailable", () => {
  const blocked = () => { throw new Error("Storage access denied"); };
  assert.equal(loadThemePreference(blocked).persistence, "unavailable");
  const selected = selectThemeColor("#d95c93", blocked);
  assert.equal(selected.persistence, "unavailable");
  assert.equal(applyDashboardTheme(selected, "#4285e6").color, "#d95c93");
});

test("failed or silently discarded writes never report saved", () => {
  const quota = () => ({ getItem: () => null, setItem: () => { throw new Error("Quota exceeded"); } });
  const discarded = () => ({ getItem: () => null, setItem: () => {} });
  for (const storage of [quota, discarded]) {
    assert.equal(selectThemeColor("#4285e6", storage).persistence, "unavailable");
  }
});

test("invalid stored or remote colors are ignored", () => {
  const initial = loadThemePreference(memoryStorage("invalid"));
  assert.equal(initial.source, "default");
  assert.deepEqual(applyDashboardTheme(initial, "#bad"), initial);
});

test("restoring default remains an explicit personal choice after reload", () => {
  const storage = memoryStorage("#4285e6");
  selectThemeColor("#58b7a4", storage);
  assert.equal(applyDashboardTheme(loadThemePreference(storage), "#9061d4").color, "#58b7a4");
});
