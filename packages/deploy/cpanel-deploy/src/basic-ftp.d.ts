declare module "basic-ftp" {
  interface AccessOptions {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    secure?: boolean | "implicit";
    secureOptions?: any;
  }

  interface FTPClient {
    access(options: AccessOptions): Promise<void>;
    cd(path: string): Promise<void>;
    send(command: string): Promise<string>;
    uploadFrom(localPath: string, remotePath: string): Promise<void>;
    downloadTo(localPath: string, remotePath: string): Promise<void>;
    list(path?: string): Promise<any[]>;
    close(): Promise<void>;
  }

  function FTPClient(): FTPClient;
  export = FTPClient;
  export { FTPClient, AccessOptions };
}