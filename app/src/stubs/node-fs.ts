export const existsSync = (_path: string): boolean => false;
export const readFileSync = (_path: string, _enc?: string): string => '';
export const writeFileSync = (_path: string, _data: string, _enc?: string): void => {};
export default { existsSync, readFileSync, writeFileSync };
