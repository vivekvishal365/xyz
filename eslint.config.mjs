import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...coreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // 01-architecture.md §5: the service layer must stay interface-independent,
    // so a future React Native client can consume the same logic. Nothing under
    // src/lib may import React or Next's client runtime.
    files: ["src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              message:
                "src/lib is the interface-independent service layer (see docs/01-architecture.md §5). Move UI code to src/components or src/app.",
            },
            {
              name: "react-dom",
              message: "src/lib must not import React DOM. See docs/01-architecture.md §5.",
            },
          ],
          patterns: [
            {
              group: ["next/navigation", "next/link", "next/image"],
              message:
                "src/lib must not depend on Next's client runtime. See docs/01-architecture.md §5.",
            },
          ],
        },
      ],
    },
  },
];

export default config;
