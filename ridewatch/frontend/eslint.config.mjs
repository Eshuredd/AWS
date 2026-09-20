import nextPlugin from "@next/eslint-plugin-next";

export default [
  {
    plugins: { "@next/next": nextPlugin },
    rules: nextPlugin.configs.recommended.rules,
  },
  {
    ignores: [
      ".next/**", ".next-dev/**", ".next-test/**", ".amplify-hosting/**", "out/**",
      "build/**", "next-env.d.ts",
    ],
  },
];
