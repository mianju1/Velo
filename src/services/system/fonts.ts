import { invoke } from "@tauri-apps/api/core";

export async function listSystemFonts(): Promise<string[]> {
  const families = await invoke<string[]>("list_system_fonts");
  return normalizeFontFamilies(families);
}

export function normalizeFontFamilies(families: string[]) {
  const seenFamilies = new Set<string>();

  return families
    .map((family) => family.trim())
    .filter((family) => family.length > 0)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))
    .filter((family) => {
      const key = family.toLocaleLowerCase();
      if (seenFamilies.has(key)) {
        return false;
      }

      seenFamilies.add(key);
      return true;
    });
}
