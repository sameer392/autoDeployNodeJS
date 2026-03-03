declare module 'dockerode' {
  const Docker: any;
  export default Docker;
}

declare module 'archiver' {
  const archiver: any;
  export default archiver;
}

declare module 'adm-zip' {
  class AdmZip {
    constructor(path?: string);
    extractAllTo(targetPath: string, overwrite?: boolean): void;
  }
  export default AdmZip;
}
