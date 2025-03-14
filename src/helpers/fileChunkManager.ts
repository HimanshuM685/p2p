import download from "js-file-download";

interface FileChunk {
    chunk: Blob;
    index: number;
}

interface ChunkedFile {
    fileName: string;
    fileType: string;
    totalChunks: number;
    receivedChunks: Map<number, Blob>;
}

export class FileChunkManager {
    private static instance: FileChunkManager;
    private fileChunks: Map<string, ChunkedFile> = new Map();
    
    private constructor() {}
    
    public static getInstance(): FileChunkManager {
        if (!FileChunkManager.instance) {
            FileChunkManager.instance = new FileChunkManager();
        }
        return FileChunkManager.instance;
    }
    
    public initFileTransfer(fileId: string, fileName: string, fileType: string, totalChunks: number): void {
        this.fileChunks.set(fileId, {
            fileName,
            fileType,
            totalChunks,
            receivedChunks: new Map()
        });
    }
    
    public addChunk(fileId: string, chunkIndex: number, chunk: Blob): boolean {
        const file = this.fileChunks.get(fileId);
        if (!file) return false;
        
        file.receivedChunks.set(chunkIndex, chunk);
        return file.receivedChunks.size === file.totalChunks;
    }
    
    public isFileComplete(fileId: string): boolean {
        const file = this.fileChunks.get(fileId);
        if (!file) return false;
        
        return file.receivedChunks.size === file.totalChunks;
    }
    
    public async assembleAndDownloadFile(fileId: string): Promise<boolean> {
        const file = this.fileChunks.get(fileId);
        if (!file) return false;
        
        if (file.receivedChunks.size !== file.totalChunks) return false;
        
        // Sort chunks by index
        const sortedChunks: Blob[] = [];
        for (let i = 0; i < file.totalChunks; i++) {
            const chunk = file.receivedChunks.get(i);
            if (chunk) {
                sortedChunks.push(chunk);
            } else {
                console.error(`Missing chunk ${i} for file ${fileId}`);
                return false;
            }
        }
        
        // Combine chunks into a single blob
        const completeFile = new Blob(sortedChunks, { type: file.fileType });
        
        // Download the complete file
        download(completeFile, file.fileName, file.fileType);
        
        // Clean up
        this.fileChunks.delete(fileId);
        
        return true;
    }
    
    public cleanupFile(fileId: string): void {
        this.fileChunks.delete(fileId);
    }
}