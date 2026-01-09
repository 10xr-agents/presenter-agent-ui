declare module "js-yaml" {
  export function load<T = any>(str: string, options?: any): T
  export function dump(obj: any, options?: any): string
  export function safeLoad<T = any>(str: string, options?: any): T
  export function safeDump(obj: any, options?: any): string
  const yaml: {
    load: typeof load
    dump: typeof dump
    safeLoad: typeof safeLoad
    safeDump: typeof safeDump
  }
  export default yaml
}
