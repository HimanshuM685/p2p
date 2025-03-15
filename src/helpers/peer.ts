import Peer, { DataConnection, PeerErrorType, PeerError } from "peerjs";
import { message } from "antd";
import { EncryptionManager } from "./encryption";  // <-- import encryption

export enum DataType {
    FILE = 'FILE',
    FILE_CHUNK = 'FILE_CHUNK',
    FILE_COMPLETE = 'FILE_COMPLETE',
    KEY_EXCHANGE = 'KEY_EXCHANGE',  // New type for key exchange
    OTHER = 'OTHER'
}

export interface Data {
    dataType: DataType;
    file?: Blob;
    fileName?: string;
    fileType?: string;
    message?: string;
    // Chunk metadata
    chunkIndex?: number;
    totalChunks?: number;
    fileId?: string; // To identify chunks belonging to the same file
    // Encryption related fields
    encryptionKey?: ArrayBuffer;  // For key exchange
    iv?: Uint8Array;              // Initialization vector
    encrypted?: boolean;          // Flag to indicate if the data is encrypted
}

let peer: Peer | undefined;
let connectionMap: Map<string, DataConnection> = new Map<string, DataConnection>();

export const PeerConnection = {
    getPeer: () => peer,
    startPeerSession: () => new Promise<string>((resolve, reject) => {
        try {
            // Generate a custom short peer ID (8 characters)
            const customId = Math.random().toString(36).substring(2, 10);
            peer = new Peer(customId, {
                config: {
                    iceServers: [{
                        urls: [ "stun:stun.l.google.com:19302" ]},
                        {
                        username: "ksKVyW-J_d72fCeKwYohQfRVx04qpKVzUwEGuISFYpA6MDcOHPdZqDLA2mleFoEMAAAAAGfUhHdIaW1hbnNodU02ODU=",
                        credential: "2a4354b8-010b-11f0-911e-0242ac140004",
                        urls: [
                            "turn:ss-turn2.xirsys.com:80?transport=udp",
                            "turn:ss-turn2.xirsys.com:3478?transport=udp",
                            "turn:ss-turn2.xirsys.com:80?transport=tcp",
                            "turn:ss-turn2.xirsys.com:3478?transport=tcp",
                            "turns:ss-turn2.xirsys.com:443?transport=tcp",
                            "turns:ss-turn2.xirsys.com:5349?transport=tcp"
                        ]
                     }]
                }
            });
            peer.on('open', (id) => {
                console.log('My ID: ' + id);
                resolve(id);
            }).on('error', (err) => {
                console.log(err);
                message.error(err.message);
            });
        } catch (err) {
            console.log(err);
            reject(err);
        }
    }),
    closePeerSession: () => new Promise<void>((resolve, reject) => {
        try {
            if (peer) {
                peer.destroy();
                peer = undefined;
            }
            resolve();
        } catch (err) {
            console.log(err);
            reject(err);
        }
    }),
    connectPeer: (id: string) => new Promise<void>((resolve, reject) => {
        if (!peer) {
            reject(new Error("Peer doesn't start yet"));
            return;
        }
        if (connectionMap.has(id)) {
            reject(new Error("Connection existed"));
            return;
        }
        try {
            let conn = peer.connect(id, { reliable: true });
            if (!conn) {
                reject(new Error("Connection can't be established"));
            } else {
                conn.on('open', function () {
                    console.log("Connect to: " + id);
                    connectionMap.set(id, conn);
                    peer?.removeListener('error', handlePeerError);
                    resolve();
                }).on('error', function (err) {
                    console.log(err);
                    peer?.removeListener('error', handlePeerError);
                    reject(err);
                });

                const handlePeerError = (err: PeerError<`${PeerErrorType}`>) => {
                    if (err.type === 'peer-unavailable') {
                        const messageSplit = err.message.split(' ');
                        const peerId = messageSplit[messageSplit.length - 1];
                        if (id === peerId) reject(err);
                    }
                };
                peer.on('error', handlePeerError);
            }
        } catch (err) {
            reject(err);
        }
    }),
    onIncomingConnection: (callback: (conn: DataConnection) => void) => {
        peer?.on('connection', function (conn) {
            console.log("Incoming connection: " + conn.peer);
            connectionMap.set(conn.peer, conn);
            callback(conn);
        });
    },
    onConnectionDisconnected: (id: string, callback: () => void) => {
        if (!peer) {
            throw new Error("Peer doesn't start yet");
        }
        if (!connectionMap.has(id)) {
            throw new Error("Connection didn't exist");
        }
        let conn = connectionMap.get(id);
        if (conn) {
            conn.on('close', function () {
                console.log("Connection closed: " + id);
                connectionMap.delete(id);
                callback();
            });
        }
    },
    sendConnection: (id: string, data: Data, onProgress: (progress: number) => void): Promise<void> => new Promise((resolve, reject) => {
        if (!connectionMap.has(id)) {
            reject(new Error("Connection didn't exist"));
            return;
        }
        try {
            let conn = connectionMap.get(id);
            if (!conn) {
                reject(new Error("Connection didn't exist"));
                return;
            }
            
            // If the file is encrypted, send it directly without chunking.
            if (data.dataType === DataType.FILE && data.encrypted && data.file) {
                conn.send(data);
                onProgress(100);
                resolve();
                return;
            }
            
            const chunkSize = 16 * 1024; // 16KB
            
            // Only chunk if it's a file and larger than chunkSize
            if (data.dataType === DataType.FILE && data.file && data.file.size > chunkSize) {
                const file = data.file as Blob;
                const totalChunks = Math.ceil(file.size / chunkSize);
                let currentChunk = 0;
                // Generate a short, unique 8-character file ID
                const fileId = Math.random().toString(36).substring(2, 10);
                
                // First send metadata to prepare receiver
                conn.send({
                    dataType: DataType.FILE_CHUNK,
                    fileName: data.fileName,
                    fileType: data.fileType,
                    fileId: fileId,
                    totalChunks: totalChunks
                });
                
                const sendChunk = () => {
                    if (currentChunk < totalChunks) {
                        const start = currentChunk * chunkSize;
                        const end = Math.min(start + chunkSize, file.size);
                        const chunk = file.slice(start, end);
                        
                        if (conn) {
                            conn.send({
                                dataType: DataType.FILE_CHUNK,
                                file: chunk,
                                chunkIndex: currentChunk,
                                totalChunks: totalChunks,
                                fileId: fileId
                            });
                            currentChunk++;
                            onProgress((currentChunk / totalChunks) * 100);
                            setTimeout(sendChunk, 100); // Simulate network delay
                        } else {
                            reject(new Error("Connection lost"));
                        }
                    } else {
                        if (conn) {  
                            conn.send({
                                dataType: DataType.FILE_COMPLETE,
                                fileId: fileId
                            });
                            resolve();
                        } else {
                            reject(new Error("Connection lost"));
                        }
                    }
                };

                sendChunk();
            } else {
                // For non-chunked data (non-encrypted or small file), send the data as is.
                conn.send(data);
                onProgress(100);
                resolve();
            }
        } catch (err) {
            reject(err);
        }
    }),
    onConnectionReceiveData: (id: string, callback: (f: Data) => void) => {
        if (!peer) {
            throw new Error("Peer doesn't start yet");
        }
        if (!connectionMap.has(id)) {
            throw new Error("Connection didn't exist");
        }
        let conn = connectionMap.get(id);
        if (conn) {
            conn.on('data', function (receivedData) {
                console.log("Receiving data from " + id);
                const data = receivedData as Data;
                // Handle key exchange
                if (data.dataType === DataType.KEY_EXCHANGE && data.encryptionKey) {
                    (async () => {
                        const encryptionManager = EncryptionManager.getInstance();
                        // Ensure encryptionKey is an ArrayBuffer
                        let keyBuffer = data.encryptionKey;
                        if (!(keyBuffer instanceof ArrayBuffer)) {
                            // Convert plain object to Uint8Array then get its buffer
                            if (keyBuffer) {
                                keyBuffer = Uint8Array.from(Object.values(keyBuffer)).buffer;
                            } else {
                                throw new Error("Encryption key is undefined");
                            }
                        }
                        const importedKey = await encryptionManager.importKey(keyBuffer);
                        encryptionManager.storeKeyForPeer(id, importedKey);
                        message.info(`Received encryption key for file "${data.fileName}"`);
                    })();
                }
                // Handle encrypted file download
                else if (data.dataType === DataType.FILE && data.encrypted && data.iv && data.file) {
                    (async () => {
                        const encryptionManager = EncryptionManager.getInstance();
                        let iv = data.iv;
                        // Ensure iv is a Uint8Array
                        if (!(iv instanceof Uint8Array)) {
                            if (iv) {
                                iv = new Uint8Array(Object.values(iv));
                            } else {
                                throw new Error("Initialization vector (iv) is undefined");
                            }
                        }
                        const key = encryptionManager.getKeyForPeer(id);
                        if (key) {
                            // If data.file doesn't have arrayBuffer(), create a Blob from it.
                            if (!data.file) {
                                throw new Error("File is undefined");
                            }
                            const fileBlob = (typeof data.file.arrayBuffer === "function")
                                ? data.file
                                : new Blob([data.file], { type: data.fileType });
                            try {
                                if (!fileBlob) {
                                    throw new Error("File blob is undefined");
                                }
                                const fileBuffer = await fileBlob.arrayBuffer();
                                const decryptedBuffer = await encryptionManager.decryptData(fileBuffer, iv, key);
                                const decryptedBlob = new Blob([decryptedBuffer], { type: data.fileType });
                                import("js-file-download").then(({ default: download }) => {
                                    download(decryptedBlob, data.fileName || "file", data.fileType);
                                });
                            } catch (err) {
                                console.error("Decryption failed", err);
                                message.error("Error decrypting file");
                            }
                        } else {
                            message.error("Encryption key not found for peer " + id);
                        }
                    })();
                } else {
                    // For all other data types, call the provided callback.
                    callback(data);
                }
            });
        }
    }
};