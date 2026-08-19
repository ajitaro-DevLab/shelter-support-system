import { fileURLToPath } from 'node:url';
import path from 'node:path';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export const databaseDirectory = path.resolve(currentDirectory, '../../../database');
