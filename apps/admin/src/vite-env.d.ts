/// <reference types="vite/client" />

// Fix react-router-dom v6 + @types/react 18.3+ incompatibility.
// ReactPortal.children became required in 18.3 but react-router-dom's
// component return types don't satisfy the new constraint.
// The `import` below converts this from a script to a module augmentation.
import type { ReactNode } from 'react';

declare module 'react' {
  interface ReactPortal {
    children?: ReactNode;
  }
}
