interface FileSystemHandlePermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface FileSystemFileHandle {
  move?(newName: string): Promise<void>;
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface DataTransferItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}

interface Window {
  showOpenFilePicker?(options?: unknown): Promise<FileSystemFileHandle[]>;
}
