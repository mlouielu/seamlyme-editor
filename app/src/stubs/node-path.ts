export const join = (...parts: string[]): string => parts.join('/');
export const resolve = (...parts: string[]): string => parts.join('/');
export const dirname = (p: string): string => p.split('/').slice(0, -1).join('/');
export const basename = (p: string, ext?: string): string => {
  const b = p.split('/').pop() ?? '';
  return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
};
export const extname = (p: string): string => {
  const b = p.split('/').pop() ?? '';
  const dot = b.lastIndexOf('.');
  return dot > 0 ? b.slice(dot) : '';
};
export default { join, resolve, dirname, basename, extname };
