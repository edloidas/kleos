import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Auto-cleanup only self-registers with vitest globals on, and they are not:
// without this every render stacks onto the same document and queries match twice.
afterEach(cleanup);
