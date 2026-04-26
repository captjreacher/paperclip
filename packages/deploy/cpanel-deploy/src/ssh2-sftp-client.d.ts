declare module "ssh2-sftp-client" {
  interface SftpClient {
    connect(config: {
      host: string;
      port: number;
      username: string;
      password: string;
      readyTimeout?: number;
      retries?: number;
    }): Promise<void>;
    end(): Promise<void>;
    exists(path: string): Promise<boolean>;
    mkdir(path: string, recursive?: boolean): Promise<string>;
    put(localPath: string, remotePath: string): Promise<void>;
    get(remotePath: string): Promise<NodeJS.ReadableStream>;
    list(remotePath: string): Promise<any[]>;
    rmd(remotePath: string, recursive?: boolean): Promise<void>;
    rm(remotePath: string): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    stat(remotePath: string): Promise<any>;
    chmod(remotePath: string, mode: number): Promise<void>;
    downloadFile(remotePath: string, localPath: string): Promise<void>;
    uploadFrom(localPath: string, remotePath: string): Promise<void>;
  }

  const SftpClient: new () => SftpClient;
  export default SftpClient;
  export { SftpClient };
}