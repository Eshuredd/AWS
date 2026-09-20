import nextPlugin from "@next/eslint-plugin-next";

export default [
  {
    plugins: { "@next/next": nextPlugin },
    rules: nextPlugin.configs.recommended.rules,
  },
  {
    ignores: [
      ".next/**", ".next-test/**", ".amplify-hosting/**", "out/**",
      "build/**", "next-env.d.ts",
    ],
  },
];
