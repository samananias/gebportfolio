/** @type {import("prettier").Config} */
export default {
  plugins: ["prettier-plugin-astro", "prettier-plugin-tailwindcss"],
  printWidth: 100,
  semi: true,
  singleQuote: false,
  tabWidth: 2,
  trailingComma: "es5",
  endOfLine: "lf",
  overrides: [
    {
      files: "*.astro",
      options: {
        parser: "astro",
      },
    },
  ],
};
