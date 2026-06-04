declare module "sql.js" {
  export interface Database {
    prepare(sql: string): Statement;
    close(): void;
  }
  export interface Statement {
    bind(values?: unknown[]): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }
  export interface InitSqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer) => Database;
  }
  export interface InitSqlJsOptions {
    wasmBinary?: Buffer | Uint8Array;
    locateFile?: (file: string) => string;
  }
  export default function initSqlJs(
    config?: InitSqlJsOptions
  ): Promise<InitSqlJsStatic>;
}
