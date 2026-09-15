import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginAstro from "eslint-plugin-astro";

export default tseslint.config(
  {
    ignores: [
      ".astro/**",
      "dist/**",
      "node_modules/**",
      ".qoder/**",
      ".agents/**",
      ".github/skills/**",
      "party/**",
      "public/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  ...eslintPluginAstro.configs["jsx-a11y-strict"],
  {
    rules: {
      // Custom rules and overrides
      // The ARIA tabs pattern requires tabindex="0" on every tabpanel so
      // keyboard users can reach the panel content; the strict preset does
      // not exempt that role, so it is allowed explicitly (spec 0009 §1).
      "astro/jsx-a11y/no-noninteractive-tabindex": ["error", { roles: ["tabpanel"] }],
    },
  }
);
